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

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import type { CapabilitiesState } from './types'
import { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import { filterSkillCatalogMessages } from './catalog'
import { evaluateToolCall } from './enforcement'
import {
  resolvePolicy, grantProposalFor, SHIPPED_TOOL_DEFAULTS, SHIPPED_BASH_PATTERNS,
  type PermissionPolicyConfig, type GrantProposal, type StandingGrant,
} from './policy'

/** Last published catalog entry names per session (dedupe of no-op updates). */
const publishedCatalog = new Map<string, string>()

export const name = 'enpoi-capabilities'
export const inject = ['tools', 'systemPrompt', 'settings', 'timer']

const ORCH_NS = 'enpoi-orchestration'

export const CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({}),
})

/**
 * Namespace owner schema for `enpoi-orchestration` — the shared state surface
 * every enpoi plugin reads (capabilities, MCP catalog + status, fleet
 * personas, orchestration parameters, UI preferences). Nested records are
 * plugin-owned vocabularies carried as opaque values so round-trips stay
 * byte-faithful.
 */
export const OrchestrationSettingsSchema = Schema.object({
  capabilities: CapabilitiesSchema,
  mcpServers: Schema.dict(Schema.any()).default({}),
  mcpStatus: Schema.dict(Schema.any()).default({}),
  personas: Schema.dict(Schema.any()).default({}),
  parameters: Schema.any(),
  uiPreferences: Schema.any(),
  permissions: Schema.any(),
})

export function apply(ctx: Context): void {
  // 0. Namespace ownership: without a registering owner,
  //    `settings.get('enpoi-orchestration')` returns undefined and every
  //    enpoi reader silently falls back to its built-in defaults (fleet
  //    routing assignments, MCP catalog, orchestration parameters).
  try {
    const settingsApi = ctx.get('settings') as {
      register?: (ns: string, schema: unknown, opts?: { base?: unknown }) => unknown
    } | undefined
    settingsApi?.register?.(ORCH_NS, OrchestrationSettingsSchema, { base: { capabilities: {} } })
  } catch (error) {
    process.stderr.write(`[enpoi-capabilities] namespace registration failed: ${String(error)}\n`)
  }

  function getGlobalDefaults(): Partial<CapabilitiesState> | undefined {
    try {
      const settings = ctx.get('settings') as { get?: (ns: unknown) => { capabilities?: Partial<CapabilitiesState> } } | undefined
      return settings?.get?.(ORCH_NS)?.capabilities
    } catch {
      return undefined
    }
  }

  // 1. Invariant B1: Monotonic pre-dispatch tool execution guard
  const disposeGuard = ctx.tools.guard((exec) => {
    const decision = evaluateToolCall(exec.name, exec.arguments as Record<string, unknown> | undefined, initialCapabilitiesState(getGlobalDefaults()))
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

    function getServerCatalog(): Record<string, { serverName?: string; transport?: string; url?: string; headers?: Record<string, string>; toolCallTimeoutMs?: number; apiKeyEnv?: string }> {
      try {
        const settings = ctx.get('settings') as { get?: (ns: unknown) => { mcpServers?: Record<string, { serverName?: string; transport?: string; url?: string; headers?: Record<string, string>; toolCallTimeoutMs?: number; apiKeyEnv?: string }> } } | undefined
        return settings?.get?.(ORCH_NS)?.mcpServers ?? {}
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

    async function syncMcpMounts(): Promise<void> {
      const state = initialCapabilitiesState(getGlobalDefaults())
      const catalog = getServerCatalog()
      const want = new Set(
        Object.entries(catalog)
          .filter(([id]) => state.mcp[id] === true)
          .map(([id]) => id),
      )
      if (want.size > 0 || mounted.size > 0) {
        process.stderr.write(`[enpoi-capabilities] mcp sync: want=[${[...want].join(',')}] mounted=[${[...mounted.keys()].join(',')}]\n`)
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
        } catch (error) {
          process.stderr.write(`[enpoi-capabilities] mcp mount failed for ${id}: ${String(error)}\n`)
        } finally {
          mountedPending.delete(id)
        }
      }
    }

    void syncMcpMounts()
    ctx.setTimeout(() => void syncMcpMounts(), 3000)
    ctx.on('settings/updated', ((ns: unknown) => {
      if (String(ns) !== 'enpoi-orchestration') return
      void syncMcpMounts()
    }) as (...args: unknown[]) => unknown)

    // 2b. Reachability heartbeat (Adam): liveness of each catalog server,
    //     INDEPENDENT of the enable toggle. green=mounted, blue=running but
    //     toggled off, grey=unreachable. Results land in
    //     enpoi-orchestration.mcpStatus so every client renders the same dots.
    interface McpStatusEntry { state: 'online' | 'down'; mounted: boolean; checkedAt: number; authError?: boolean }
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
        next[id] = { state: probe.state, mounted: false, checkedAt: Date.now(), ...(probe.authError ? { authError: true } : {}) }
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
      const settings = ctx.get('settings') as { get?: (ns: unknown) => { permissions?: PermissionPolicyConfig } } | undefined
      return settings?.get?.(ORCH_NS)?.permissions ?? {}
    } catch {
      return {}
    }
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

  function agentNameOf(exec: { agent?: { preset?: string; agentPreset?: string; label?: string; name?: string } }): string | undefined {
    const a = exec.agent
    if (a === undefined) return undefined
    return a.agentPreset ?? a.preset ?? a.name ?? a.label
  }

  const disposePolicy = ctx.on('tools/pre-execute', (async (exec: { name: string; arguments?: Record<string, unknown>; callId?: string | number; agent?: { session?: unknown } }, next: () => Promise<{ kind: string; reason?: string }>) => {
    // Capability-disabled check FIRST (Oracle 1.2): the registry runs serviceAsk
    // before guardReason, so a disabled tool with an ask policy would otherwise
    // prompt and then deny after the user clicks allow.
    const state = initialCapabilitiesState(getGlobalDefaults())
    const capabilityDecision = evaluateToolCall(exec.name, exec.arguments, state)
    if (!capabilityDecision.allowed) {
      return { kind: 'deny', reason: capabilityDecision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.` }
    }
    const config = readPermissionConfig()
    const isBash = exec.name === 'bash'
    const decision = resolvePolicy({
      toolName: exec.name,
      command: isBash && typeof exec.arguments?.command === 'string' ? exec.arguments.command : undefined,
      agent: agentNameOf(exec),
      config,
      sandboxMode: readSandboxMode(exec.agent as { session?: unknown } | undefined),
    })
    if (decision.kind === 'allow') return await next()
    if (decision.kind === 'deny') return { kind: 'deny', reason: decision.reason }
    // ask: stash the grant proposal for the host-side allow-always writer.
    if (typeof exec.callId === 'string' && pendingGrants.size < 128) {
      pendingGrants.set(String(exec.callId), grantProposalFor(decision, exec.name, isBash ? String(exec.arguments?.command) : undefined, agentNameOf(exec)))
    }
    return { kind: 'ask', reason: decision.reason }
  }) as (...args: unknown[]) => unknown)
  ctx.effect(() => disposePolicy, 'enpoi-capabilities: permission policy pre-execute')

  // Host-side allow-always persistence (Oracle amendment 2): the card only
  // answers; the host observes the decided outcome and writes the standing
  // grant into settings under the file lock — no client-side read-modify-write.
  function persistGrant(proposal: GrantProposal): void {
    try {
      const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const grant: StandingGrant = { id, tool: proposal.tool, ...(proposal.pattern !== undefined ? { pattern: proposal.pattern } : {}), ...(proposal.agent !== undefined ? { agent: proposal.agent } : {}), createdAt: new Date().toISOString() }
      const settings = ctx.get('settings') as {
        mutate?: (ops: Array<{ op: string; path: string[]; value?: unknown }>, ns?: string) => Promise<unknown> | unknown
      } | undefined
      const existing = readPermissionConfig().grants ?? {}
      const next = { ...existing, [id]: grant }
      void settings?.mutate?.([{ op: 'set', path: ['permissions', 'grants'], value: next }], ORCH_NS)
      process.stderr.write(`[enpoi-capabilities] standing grant persisted: ${grant.tool}${grant.pattern ? ` ${grant.pattern}` : ''}${grant.agent ? ` (agent ${grant.agent})` : ''}\n`)
    } catch (error) {
      process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}\n`)
    }
  }

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
    if (proposal !== undefined) persistGrant(proposal)
    return undefined
  }) as (...args: unknown[]) => unknown)
  ctx.effect(() => disposeGrantWatch, 'enpoi-capabilities: allow-always grant writer')
}

export type { CapabilitiesState, CapabilityDescriptor, CapabilityKind } from './types'
export { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
export { initialCapabilitiesState } from './state'
export { evaluateToolCall } from './enforcement'
