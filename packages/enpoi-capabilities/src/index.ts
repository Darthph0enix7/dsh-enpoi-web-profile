/**
 * enpoi-capabilities — Capabilities enforcement engine (Global Management).
 *
 * Implements:
 * - B1: Execution-level enforcement via monotonic tool guard (`ctx.tools.guard`).
 * - B4: Disabled skills are SHADOWED out of every injection surface — a runtime twin
 *   with both invocation surfaces off outranks the provider entry (providerOrder -1),
 *   so the skill vanishes from the model-facing catalog, the `skill` tool, and the
 *   `/name` user gesture, exactly as if it were uninstalled. Zero token cost.
 * - I15: Protected infrastructure invariants (contracts, keeper, cascade, living-brief, read, glob, grep).
 *
 * The operator UI lives in the dsh-better-sidebar "Capabilities & Tools" drawer
 * (sidebar-patch/src/client/CapabilitiesView.tsx); this plugin is the single
 * enforcement + state-resolution backend both surfaces write into via
 * settings namespace `enpoi-orchestration.capabilities`.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { readOrchestrationDocument, type SettingsDocumentReader } from 'dsh-enpoi-contracts'
import type { CapabilitiesState } from './types'
import { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import { filterSkillCatalogMessages } from './catalog'
import { evaluateToolCall } from './enforcement'
import {
  resolvePolicy, grantProposalFor, standingGrantRecord, agentRoleOf, mcpServerNameOf, mcpPolicyRemovalOps,
  SHIPPED_TOOL_DEFAULTS, SHIPPED_BASH_PATTERNS,
  type AgentLike, type PermissionPolicyConfig, type GrantProposal, type StandingGrant,
} from './policy'
import { canFenceMcpWrites, type McpCatalogSettings, type SettingsPathOp } from './mcp-tools'

/** Last published catalog entry names per session (dedupe of no-op updates). */
const publishedCatalog = new Map<string, string>()

export const name = 'enpoi-capabilities'
export const inject = ['tools', 'systemPrompt', 'settings', 'timer']

const ORCH_NS = 'enpoi-orchestration'

/**
 * Mark a schema subtree live-editable. The merged engine's vendored
 * schemastery carries `.volatile()`; the pre-0.1.7 build of the same module
 * predates it, and the profile must boot on both during the sync window.
 */
function live<T extends object>(schema: T): T {
  return (schema as T & { volatile?: () => T }).volatile?.() ?? schema
}

export const CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({}),
})

/** One MCP server catalog entry (`enpoi-orchestration.mcpServers.<id>`). */
export interface OrchestrationMcpServer {
  serverName?: string
  transport?: string
  url?: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number
  apiKeyEnv?: string
}

/**
 * Namespace owner Config for `enpoi-orchestration` — the shared state surface
 * every enpoi plugin reads (capabilities, MCP catalog + status, fleet
 * personas, orchestration parameters, UI preferences). Under the merged
 * settings model the owner entry's Config IS the document: `settings.yaml` is
 * imported into the entry of the same id, the settings service projects these
 * `.volatile()` fields as a live form, and every other plugin reads the
 * document through the settings service (see `dsh-enpoi-contracts`
 * `readOrchestrationDocument`). Nested records stay opaque plugin-owned
 * vocabularies so round-trips are byte-faithful.
 */
export interface OrchestrationConfig {
  /** Global capability toggles (tools/skills/mcp). */
  capabilities: Volatile<Partial<CapabilitiesState>>
  /** Declarative MCP server catalog; a mount requires `capabilities.mcp[id] === true`. */
  mcpServers: Volatile<Record<string, OrchestrationMcpServer>>
  /** Runtime reachability heartbeat written by this plugin (green/blue/grey dots). */
  mcpStatus: Volatile<Record<string, unknown>>
  /** Fleet model assignments per persona/seat id. */
  personas: Volatile<Record<string, unknown>>
  /** Operator-defined specialist roles (doc 59). */
  roles: Volatile<Record<string, unknown>>
  /** Operator-defined councils (doc 59). */
  councils: Volatile<Record<string, unknown>>
  /** Operator-defined model failover chains (doc 60). */
  chains: Volatile<Record<string, unknown>>
  /** Orchestration parameters (council/keeper/oracle/memory/verifyGate). */
  parameters: Volatile<Record<string, unknown>>
  /** UI preferences (favorites, hidden models, hidden surfaces, provider order). */
  uiPreferences: Volatile<Record<string, unknown>>
  /** Permission policy document (defaults/tools/grants/agents) — doc 55. */
  permissions: Volatile<PermissionPolicyConfig>
  /** Pinned whiteboard store (doc 66 §3c / doc 67 §B). */
  whiteboard: Volatile<Record<string, unknown>>
}

export const OrchestrationSettingsSchema = Schema.object({
  capabilities: live(CapabilitiesSchema.default({})),
  mcpServers: live(Schema.dict(Schema.any()).default({})),
  mcpStatus: live(Schema.dict(Schema.any()).default({})),
  personas: live(Schema.dict(Schema.any()).default({})),
  // Operator-defined specialist roles and councils (doc 59): declared here so
  // the namespace contract is explicit rather than relying on unknown-key
  // survival — both remain opaque plugin-owned vocabularies.
  roles: live(Schema.dict(Schema.any()).default({})),
  councils: live(Schema.dict(Schema.any()).default({})),
  // Operator-defined model failover chains (doc 60): id → { label?, links,
  // attempts?, onCut?, disabled? }. Owned by enpoi-model-chains, declared here
  // so the namespace contract admits the key rather than relying on
  // unknown-key survival.
  chains: live(Schema.dict(Schema.any()).default({})),
  parameters: live(Schema.dict(Schema.any()).default({})),
  // UI preferences (favorites, hidden models, model assignments, …) shared by
  // every client through `settings/document-updated`. The whole record stays
  // opaque so sibling keys survive the form projection.
  uiPreferences: live(Schema.dict(Schema.any()).default({})),
  permissions: live(Schema.dict(Schema.any()).default({})),
  // Pinned whiteboard (doc 66 §3c / doc 67 §B): orchestrator-authored
  // core-context board, owned by enpoi-whiteboard and rendered into every
  // runtime-context snapshot. Declared so the namespace contract admits the
  // key rather than relying on unknown-key survival.
  whiteboard: live(Schema.dict(Schema.any()).default({})),
})

/** Function-plugin Config export: the owning entry's schema IS the shared document. */
export const Config = OrchestrationSettingsSchema

/**
 * Revision-fenced removal of every policy row belonging to servers that left
 * the catalog: the `mcp__<server>__*` wildcard, exact `mcp__<server>__<tool>`
 * rows, and the same keys under every agent override. The permission config is
 * re-read on each attempt so a concurrent write is included, not clobbered.
 * The removal path itself ({@link removeMcpServerFenced}) unsets catalog entry
 * and rows in one write; this is the backstop for catalog shrinks that arrived
 * through another writer.
 * @param settings - settings service (no-op when unavailable).
 * @param servers - mounted server names that are no longer in the catalog.
 * @param readConfig - fresh permission-config reader.
 * @returns the number of rule rows unset.
 */
export async function pruneRemovedMcpPolicyRows(
  settings: McpCatalogSettings | undefined,
  servers: readonly string[],
  readConfig: () => PermissionPolicyConfig | undefined,
): Promise<number> {
  if (!canFenceMcpWrites(settings) || servers.length === 0) return 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ops: SettingsPathOp[] = servers.flatMap(server => mcpPolicyRemovalOps(server, readConfig()))
    if (ops.length === 0) return 0
    const revision = settings.describe?.().find((entry: { ns: string; revision?: number }) => entry.ns === ORCH_NS)?.revision
    try {
      await settings.mutate(ORCH_NS, ops, revision)
      return ops.length
    } catch (error) {
      const conflict = error as { code?: string }
      if ((conflict?.code === 'SETTINGS_CONFLICT' || conflict?.code === 'settings/conflict') && attempt < 2) continue
      throw error
    }
  }
  return 0
}

export function apply(ctx: Context, config: OrchestrationConfig = {} as OrchestrationConfig): void {
  // 0. Ownership: the merged settings model derives the form from THIS entry's
  //    Config (`enpoi-orchestration` is the entry id), so no namespace
  //    registration is needed. Pre-0.1.7 engines still build their document
  //    from a registered namespace schema — the optional call is a no-op on
  //    the merged engine and keeps the sync-window profile bootable on both.
  try {
    const settingsApi = ctx.get('settings') as {
      register?: (ns: string, schema: unknown, opts?: { base?: unknown }) => unknown
    } | undefined
    settingsApi?.register?.(ORCH_NS, OrchestrationSettingsSchema, { base: { capabilities: {} } })
  } catch (error) {
    process.stderr.write(`[enpoi-capabilities] namespace registration failed: ${String(error)}\n`)
  }

  // 0a. This plugin ships its own client page (the Capabilities & Tools drawer
  //     in the sidebar patch), so suppress the auto-generated settings page.
  ctx.inject(['settings'], (child) => {
    child.effect(() => {
      const settings = child.get('settings') as { configure?: (presentation: { auto?: boolean }, owner?: unknown) => () => void } | undefined
      return settings?.configure?.({ auto: false }, ctx.fiber)
    })
  })

  /**
   * Read one shared-document field. The merged engine hands the owner entry's
   * volatile Config fields to `apply` as references; a pre-0.1.7 engine has no
   * Config-backed namespace, so the same field is read back from the registered
   * settings namespace instead — one profile boots on both.
   */
  function documentValue<T>(field: Volatile<T> | T | undefined, key: string): T | undefined {
    const ref = field as Volatile<T> | undefined
    if (typeof ref?.get === 'function') return ref.get()
    const document = readOrchestrationDocument(ctx.get('settings') as SettingsDocumentReader | undefined)
    return document?.[key] as T | undefined
  }

  /** The live capability toggles, read through the owning Config reference. */
  function getGlobalDefaults(): Partial<CapabilitiesState> | undefined {
    try {
      return documentValue(config.capabilities, 'capabilities')
    } catch {
      return undefined
    }
  }

  // 0b. Permissions matrix source: `enpoiCapabilities.mcpTools` projects the
  //     LIVE tool registry (`ctx.tools.schemas()`) so the Permissions page
  //     lists the real `mcp__<server>__<tool>` rows with their policy chips,
  //     and follows mounting/unmounting dynamically. Imported lazily so the
  //     @Remote decorator stays out of the unit-test import graph.
  void import('./rpc.ts').then((remote) => {
    try {
      remote.mountCapabilitiesRemote(ctx)
    } catch (error) {
      process.stderr.write(`[enpoi-capabilities] capabilities remote mount failed: ${String(error)}\n`)
    }
  }).catch(() => {})

  // 1. Invariant B1: Monotonic pre-dispatch tool execution guard
  const disposeGuard = ctx.tools.guard((exec) => {
    const decision = evaluateToolCall(exec.name, exec.arguments as Record<string, unknown> | undefined, initialCapabilitiesState(getGlobalDefaults()), readMcpCatalogDefs())
    if (!decision.allowed) {
      return decision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.`
    }
    return undefined
  })
  ctx.effect(() => disposeGuard, 'enpoi-capabilities: tool guard')

  // 1b. Invariant B1b: Disabled tools are STRIPPED from the model-facing tool
  // schema entirely (zero token cost, no instruction-following risk). The
  // system-prompt/assemble waterfall carries the assembled tool list; we
  // filter out every disabled tool (minus the I15 protected set) so the model
  // never sees the schema, never attempts the call, and never wastes tokens.
  // The B1 guard stays as the execution-time backstop for in-flight turns.
  const disposeAssemble = ctx.on('system-prompt/assemble', (async (_assembly: unknown, _context: unknown, next: () => Promise<unknown>) => {
    const assembled = (await next()) as { tools?: Array<{ name: string }> }
    if (!Array.isArray(assembled.tools) || assembled.tools.length === 0) return assembled
    const state = initialCapabilitiesState(getGlobalDefaults())
    const disabled = new Set(
      Object.entries(state.tools)
        .filter(([id, enabled]) => !enabled && !PROTECTED_CAPABILITIES.has(id))
        .map(([id]) => id),
    )
    if (disabled.size === 0) return assembled
    const kept = assembled.tools.filter(tool => !disabled.has(tool.name))
    if (kept.length === assembled.tools.length) return assembled
    return { ...assembled, tools: kept }
  }) as (...args: unknown[]) => unknown)
  ctx.effect(() => disposeAssemble, 'enpoi-capabilities: tool schema strip')

  // 2. MCP mounting (B5): capabilities.mcp[id]===true spawns a live mcp-client
  //     fiber for the server catalog entry (enpoi-orchestration.mcpServers) —
  //     its mcp__<server>__* tools register and are injected like native tools.
  //     false = the fiber is disposed and the tools vanish from the schema
  //     entirely (Adam's model: "disabling = not injected at all"). The B1
  //     guard stays as the execution backstop for in-flight turns.
  import('@deepseek-ai/dsh-mcp-client').then(async (mcpClient) => {
    type Fiber = { dispose: () => Promise<void> } & PromiseLike<unknown>
    const mounted = new Map<string, Fiber>()
    const mountedPending = new Set<string>()
    /** Last mount failure per server id; surfaced through the status heartbeat. */
    const mountErrors = new Map<string, string>()
    /** Mount errors already pushed to `mcpStatus` (dedupe of the retry-triggering write). */
    const publishedMountErrors = new Map<string, string>()

    function getServerCatalog(): Record<string, OrchestrationMcpServer> {
      try {
        return documentValue(config.mcpServers, 'mcpServers') ?? {}
      } catch {
        return {}
      }
    }

    /**
     * Resolve an apiKeyEnv reference through the deployment credential
     * provider (process env + ~/.dsh/.credentials.yaml sources); values are
     * never logged.
     */
    async function resolveCredential(name: string | undefined): Promise<string | undefined> {
      if (!name) return undefined
      const seam = ctx.get('credentials') as
        | { resolve?: (ref: string) => Promise<{ value: string } | undefined> }
        | undefined
      if (seam?.resolve === undefined) return undefined
      try {
        const hit = await seam.resolve(name)
        return hit?.value
      } catch {
        return undefined
      }
    }

    /** Signature of the last logged sync: repeated settings pushes stay silent. */
    let lastSyncSignature: string | undefined

    async function syncMcpMounts(): Promise<void> {
      const state = initialCapabilitiesState(getGlobalDefaults())
      const catalog = getServerCatalog()
      const want = new Set(
        Object.entries(catalog)
          .filter(([id]) => state.mcp[id] === true)
          .map(([id]) => id),
      )
      // A server that left the catalog (removed) or was toggled off no longer
      // has a failure to report; drop its error before publishing status.
      for (const id of [...mountErrors.keys()]) {
        if (want.has(id)) continue
        mountErrors.delete(id)
        publishedMountErrors.delete(id)
      }
      if (want.size > 0 || mounted.size > 0) {
        const signature = `want=[${[...want].join(',')}] mounted=[${[...mounted.keys()].join(',')}]`
        if (signature !== lastSyncSignature) {
          lastSyncSignature = signature
          process.stderr.write(`[enpoi-capabilities] mcp sync: ${signature}\n`)
        }
      }
      // Unmount disabled / removed servers
      for (const [id, fiber] of [...mounted]) {
        if (!want.has(id)) {
          mounted.delete(id)
          void fiber.dispose().catch(() => {})
        }
      }
      // Mount newly enabled servers
      for (const id of want) {
        if (mounted.has(id) || mountedPending.has(id)) continue
        const def = catalog[id]
        const serverName = def.serverName ?? id.replace(/-mcp$/, '')
        if (!def.url) continue
        mountedPending.add(id)
        try {
          const apiKey = await resolveCredential(def.apiKeyEnv)
          const headers: Record<string, string> = { ...(def.headers ?? {}) }
          if (apiKey) headers.Authorization = `Bearer ${apiKey}`
          const fiber = ctx.plugin(mcpClient.apply, {
            transport: 'streamable-http',
            serverName,
            url: def.url,
            headers,
            toolCallTimeoutMs: def.toolCallTimeoutMs ?? 60_000,
            failOnStartupError: false,
          }) as unknown as Fiber
          await fiber
          mounted.set(id, fiber)
          mountErrors.delete(id)
          publishedMountErrors.delete(id)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          mountErrors.set(id, message)
          process.stderr.write(`[enpoi-capabilities] mcp mount failed for ${id}: ${message}\n`)
          // Publish the failure once per message: the status write itself emits
          // `settings/updated`, which retries the mount, so an unguarded publish
          // would spin. A different message re-publishes; a successful mount clears it.
          if (publishedMountErrors.get(id) !== message) {
            publishedMountErrors.set(id, message)
            void probeAll().catch(() => {})
          }
        } finally {
          mountedPending.delete(id)
        }
      }
    }

    void syncMcpMounts()
    ctx.setTimeout(() => void syncMcpMounts(), 3000)
    // Only a change to the toggle map warrants a re-sync: the heartbeat writes
    // mcpStatus into the same namespace, and reacting to that fed a loop.
    let lastSyncedToggleMap: string | undefined
    const onTogglesUpdated = ((ns: unknown) => {
      if (String(ns) !== 'enpoi-orchestration') return
      const toggleMap = JSON.stringify(initialCapabilitiesState(getGlobalDefaults()).mcp)
      if (toggleMap === lastSyncedToggleMap) return
      lastSyncedToggleMap = toggleMap
      void syncMcpMounts()
    }) as (...args: unknown[]) => unknown
    // The merged form service emits `settings/document-updated`; the pre-0.1.7
    // storage service emitted `settings/updated`. Both engines stay wired.
    ctx.on('settings/updated', onTogglesUpdated)
    ctx.on('settings/document-updated', onTogglesUpdated)

    // 2b. Reachability heartbeat (Adam): liveness of each catalog server,
    //     INDEPENDENT of the enable toggle. green=mounted, blue=running but
    //     toggled off, grey=unreachable. Results land in
    //     enpoi-orchestration.mcpStatus so every client renders the same dots.
    interface McpStatusEntry { state: 'online' | 'down'; mounted: boolean; checkedAt: number; authError?: boolean; error?: string }
    let lastWrittenJson = ''

    /** One Streamable-HTTP liveness handshake; any HTTP response ⇒ online. */
    async function probeServer(id: string, def: { url?: string; headers?: Record<string, string>; apiKeyEnv?: string }): Promise<{ state: 'online' | 'down'; authError?: boolean }> {
      if (!def.url) return { state: 'down' }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2500)
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(def.headers ?? {}),
        }
        const apiKey = await resolveCredential(def.apiKeyEnv)
        if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`
        // Minimal Streamable-HTTP liveness: a JSON-RPC initialize handshake.
        const res = await fetch(def.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'enpoi-capabilities-probe', version: '1.0.0' } } }),
          signal: controller.signal,
        })
        return { state: 'online', authError: res.status === 401 || res.status === 403 }
      } catch {
        return { state: 'down' }
      } finally {
        clearTimeout(timer)
      }
    }

    async function probeAll(): Promise<void> {
      const catalog = getServerCatalog()
      const next: Record<string, McpStatusEntry> = {}
      for (const [id, def] of Object.entries(catalog)) {
        const isMounted = mounted.has(id) || mountedPending.has(id)
        if (isMounted) {
          next[id] = { state: 'online', mounted: true, checkedAt: Date.now() }
          continue
        }
        const probe = await probeServer(id, def)
        next[id] = {
          state: probe.state,
          mounted: false,
          checkedAt: Date.now(),
          ...(probe.authError ? { authError: true } : {}),
          ...(mountErrors.has(id) ? { error: mountErrors.get(id) } : {}),
        }
      }
      const json = JSON.stringify(next)
      if (json === lastWrittenJson) return
      lastWrittenJson = json
      try {
        const settingsApi = ctx.get('settings') as unknown as { mutate?: (ns: unknown, ops: { op: string; path: string[]; value?: unknown }[]) => Promise<unknown> | undefined }
        void settingsApi.mutate?.(ORCH_NS, [{ op: 'set', path: ['mcpStatus'], value: next }])
      } catch {
        // non-fatal: status is advisory only
      }
    }

    ctx.setInterval(() => void probeAll().catch(() => {}), 15_000)
    ctx.setTimeout(() => void probeAll().catch(() => {}), 4_000)
  }).catch(() => {})

  // 3. Invariant B4: Disabled skills are stripped from the skill-catalog message
  //    before it reaches the model. The catalog listener (tool-skill) appends a
  //    user message with source.kind==='skill-catalog' containing the <available_skills>
  //    block. We register a later pre-step waterfall listener that finds that message
  //    and removes lines for disabled skills — zero injection, zero token cost.
  //    This approach is timing-agnostic (no provider race), rank-agnostic (no rank
  //    contest with the filesystem provider), and fully dynamic (reads settings at
  //    each turn). The guard (B1) remains the execution-time backstop.
  ctx.on('agent/pre-step', (async (params: { agent?: { session?: { id?: string } } }, next: (...args: unknown[]) => Promise<unknown>) => {
    const decision = (await next()) as {
      kind: string
      messages?: Array<{ source?: unknown; content?: unknown }>
    }
    if (decision.kind !== 'enter') return decision
    const messages = decision.messages
    if (!Array.isArray(messages)) return decision

    const state = initialCapabilitiesState(getGlobalDefaults())
    // Key-driven: ANY skill disabled in settings is stripped — including skills
    // created on disk after this plugin was written (OpenCode-parity dynamics).
    const disabledSkillIds = new Set(
      Object.entries(state.skills).filter(([, enabled]) => enabled === false).map(([id]) => id),
    )
    if (disabledSkillIds.size === 0) return decision

    const sessionId = params?.agent?.session?.id ?? ''
    const { messages: filtered } = filterSkillCatalogMessages(messages, disabledSkillIds, publishedCatalog, sessionId)
    return { ...decision, messages: filtered }
  }) as (...args: unknown[]) => unknown)

  // ── Permission policy engine (doc 55) ────────────────────────────────────
  // Fresh per dispatch; settings.yaml is the single source of truth. The
  // capability-disabled check runs HERE (not via the separate tools.guard):
  // the registry resolves serviceAsk BEFORE guardReason, so a disabled tool
  // with an ask policy would prompt first and deny after (Oracle amendment).
  // Grants short-circuit asks at the granularity the ask arose at; deny
  // always terminates; grants never upgrade a deny.

  /** Pending ask proposals by callId — consumed by allow-always grant writes. */
  const pendingGrants = new Map<string, GrantProposal>()

  function readPermissionConfig(): PermissionPolicyConfig {
    try {
      return documentValue(config.permissions, 'permissions') ?? {}
    } catch {
      return {}
    }
  }

  /**
   * The live MCP catalog (`enpoi-orchestration.mcpServers`) as id → descriptor.
   * `undefined` = settings unreadable; `{}` = no catalog entries. The
   * capability-disabled check maps a tool-name server segment back to its
   * catalog id — the key `capabilities.mcp[...]` is written under.
   */
  function readMcpCatalogDefs(): Record<string, OrchestrationMcpServer> | undefined {
    try {
      const catalog = documentValue(config.mcpServers, 'mcpServers')
      // A namespace without a readable catalog (mid-reload / unregistered) is
      // NOT an empty catalog: treating it as one would prune every live row.
      if (catalog === undefined || catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) return undefined
      return catalog
    } catch {
      return undefined
    }
  }

  /**
   * Mounted MCP server names of the live catalog (`serverName ?? id minus
   * '-mcp'` — the naming the MCP mount and the client's permission grouping
   * both use). `undefined` = settings unreadable; `[]` = no catalog entries.
   */
  function readMcpServerNames(): string[] | undefined {
    const catalog = readMcpCatalogDefs()
    return catalog === undefined ? undefined : Object.entries(catalog).map(([id, def]) => mcpServerNameOf(id, def))
  }

  /** The session's current agent preset, through the projection registry. */
  function currentPresetOf(session: unknown): string | undefined {
    try {
      const projections = ctx.get('sessionProjections') as { stateOf?: (session: unknown, key: string) => unknown } | undefined
      const value = projections?.stateOf?.(session, 'agentPreset')
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /** The asking agent's role id for one live exec (session header/projection). */
  function askingAgentOf(exec: { agent?: AgentLike }): string | undefined {
    return agentRoleOf(exec.agent, currentPresetOf)
  }

  function readSandboxMode(agent: { session?: { id?: string } } | undefined): string | undefined {
    try {
      const session = agent?.session
      if (session === undefined || typeof session.eventAt !== 'function') return undefined
      for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
        const event = session.eventAt(seq)
        if (event?.type === 'sandbox/mode') return String((event.data as { mode?: string }).mode ?? '')
      }
      const shell = ctx.get('shell') as { sandboxMode?: string } | undefined
      return shell?.sandboxMode
    } catch {
      return undefined
    }
  }

  const disposePolicy = ctx.on('tools/pre-execute', (async (exec: { name: string; arguments?: Record<string, unknown>; callId?: string | number; agent?: AgentLike }, next: () => Promise<{ kind: string; reason?: string }>) => {
    // Capability-disabled check FIRST (Oracle 1.2): the registry runs serviceAsk
    // before guardReason, so a disabled tool with an ask policy would otherwise
    // prompt and then deny after the user clicks allow.
    const state = initialCapabilitiesState(getGlobalDefaults())
    const capabilityDecision = evaluateToolCall(exec.name, exec.arguments, state, readMcpCatalogDefs())
    if (!capabilityDecision.allowed) {
      return { kind: 'deny', reason: capabilityDecision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.` }
    }
    const config = readPermissionConfig()
    const isBash = exec.name === 'bash'
    const decision = resolvePolicy({
      toolName: exec.name,
      command: isBash && typeof exec.arguments?.command === 'string' ? exec.arguments.command : undefined,
      agent: askingAgentOf(exec),
      config,
      sandboxMode: readSandboxMode(exec.agent as { session?: unknown } | undefined),
      mcpServerNames: readMcpServerNames() ?? [],
    })
    if (decision.kind === 'allow') return await next()
    if (decision.kind === 'deny') return { kind: 'deny', reason: decision.reason }
    // ask: stash the grant proposal for the host-side allow-always writer.
    if (typeof exec.callId === 'string' && pendingGrants.size < 128) {
      pendingGrants.set(String(exec.callId), grantProposalFor(decision, exec.name, isBash ? String(exec.arguments?.command) : undefined, askingAgentOf(exec)))
    }
    return { kind: 'ask', reason: decision.reason }
  }) as (...args: unknown[]) => unknown)
  ctx.effect(() => disposePolicy, 'enpoi-capabilities: permission policy pre-execute')

  // Host-side allow-always persistence (Oracle amendment 2): the card only
  // answers; the host observes the decided outcome and writes the standing
  // grant into settings under the file lock — no client-side read-modify-write.
  async function persistGrant(proposal: GrantProposal): Promise<void> {
    const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const grant: StandingGrant = standingGrantRecord(id, proposal, new Date().toISOString())
    const settings = ctx.get('settings') as {
      describe?: () => Array<{ ns: string; revision?: number }>
      mutate?: (ns: string, ops: Array<{ op: string; path: string[]; value?: unknown }>, expectedRevision?: number) => Promise<unknown>
    } | undefined
    if (settings?.mutate === undefined) {
      process.stderr.write('[enpoi-capabilities] grant persistence failed: settings service unavailable\n')
      return
    }
    // The grants map is written as a whole leaf value, so the write is fenced
    // with the namespace revision and re-applied onto the fresh map on a
    // conflict (another writer won the race); the operator's grant is never
    // silently dropped and never clobbers a concurrent grant.
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = settings.describe?.().find((entry: { ns: string; revision?: number }) => entry.ns === ORCH_NS)?.revision
      const existing = readPermissionConfig().grants ?? {}
      const next = { ...existing, [id]: grant }
      try {
        await settings.mutate(ORCH_NS, [{ op: 'set', path: ['permissions', 'grants'], value: next }], revision)
        process.stderr.write(`[enpoi-capabilities] standing grant persisted: ${grant.tool}${grant.pattern ? ` ${grant.pattern}` : ''}${grant.agent ? ` (agent ${grant.agent})` : ''}\n`)
        return
      } catch (error) {
        const conflict = error as { code?: string }
        if (conflict?.code === 'SETTINGS_CONFLICT' && attempt < 2) continue
        process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}\n`)
        return
      }
    }
  }

  // A server that leaves the catalog (or is renamed) would otherwise leave
  // its policy rows behind forever — inert but accumulating. Observe catalog
  // shrink and unset every row of a server that is gone, under the same
  // revision fence as the grant writer. The baseline is seeded at boot; a
  // server already absent then is not treated as a removal (its rows may be
  // operator-prepared rules).
  let lastMcpServerNames = readMcpServerNames()
  const onCatalogUpdated = ((ns: unknown) => {
    if (String(ns) !== ORCH_NS) return
    const names = readMcpServerNames()
    if (names === undefined) return
    const previous = lastMcpServerNames
    lastMcpServerNames = names
    if (previous === undefined) return
    const current = new Set(names)
    const removed = [...new Set(previous.filter(name => !current.has(name)))]
    if (removed.length === 0) return
    const settings = ctx.get('settings') as McpCatalogSettings | undefined
    void pruneRemovedMcpPolicyRows(settings, removed, readPermissionConfig)
      .then((count) => {
        if (count > 0) process.stderr.write(`[enpoi-capabilities] removed MCP policy rows: ${count} row(s) for ${removed.join(', ')}\n`)
      })
      .catch((error: unknown) => {
        process.stderr.write(`[enpoi-capabilities] removed MCP policy cleanup failed: ${String(error)}\n`)
      })
  }) as (...args: unknown[]) => unknown
  ctx.effect(() => {
    const disposeUpdated = ctx.on('settings/updated', onCatalogUpdated)
    const disposeDocumentUpdated = ctx.on('settings/document-updated', onCatalogUpdated)
    return () => {
      disposeUpdated()
      disposeDocumentUpdated()
    }
  }, 'enpoi-capabilities: removed-MCP policy cleanup')

  const disposeGrantWatch = ctx.on('session/event', ((session: { id?: string; eventAt?: (seq: number) => { type: string; data?: Record<string, unknown>; seq?: number } | undefined; seq?: number }, event: { type: string; seq?: number; data?: Record<string, unknown> }) => {
    if (event?.type !== 'approval/decided') return undefined
    const outcome = event.data?.outcome
    if (outcome !== 'allowed-always') return undefined
    const approvalId = (event.data as { id?: string }).id
    if (approvalId === undefined) return undefined
    // The decided event carries the APPROVAL id; the paired asked event carries
    // the exec callId our pending-proposal map is keyed by. Pair them by scan.
    let callId: string | undefined
    if (typeof session?.eventAt === 'function') {
      for (let seq = (event.seq ?? session.seq ?? 0); seq >= 0 && seq >= (event.seq ?? 0) - 64; seq -= 1) {
        const e = session.eventAt(seq)
        if (e?.type === 'approval/asked' && (e.data as { id?: string }).id === approvalId) {
          const c = (e.data as { callId?: string }).callId
          if (c !== undefined) callId = String(c)
          break
        }
      }
    }
    if (callId === undefined) {
      // Fallback: pop the oldest pending proposal (single-approval flows).
      callId = [...pendingGrants.keys()][0]
    }
    if (callId === undefined) return undefined
    const proposal = pendingGrants.get(callId)
    pendingGrants.delete(callId)
    if (proposal !== undefined) void persistGrant(proposal).catch((error: unknown) => {
      process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}\n`)
    })
    return undefined
  }) as (...args: unknown[]) => unknown)
  ctx.effect(() => disposeGrantWatch, 'enpoi-capabilities: allow-always grant writer')
}

export type { CapabilitiesState, CapabilityDescriptor, CapabilityKind } from './types'
export { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
export { initialCapabilitiesState } from './state'
export { evaluateToolCall } from './enforcement'
