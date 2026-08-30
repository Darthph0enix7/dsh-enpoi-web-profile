/**
 * enpoi-capabilities — Capabilities enforcement engine (Global Management).
 *
 * Implements:
 * - B1: Execution-level enforcement via monotonic tool guard (`ctx.tools.guard`).
 * - B3: Dynamic runtime-context snapshot line reflecting active/disabled capabilities (KV-cache safe).
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
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import type { CapabilitiesState } from './types'
import { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import { evaluateToolCall, formatCapabilitiesSnapshot } from './enforcement'

export const name = 'enpoi-capabilities'
export const inject = ['tools', 'systemPrompt', 'settings', 'timer']

const ORCH_NS = settingsNamespace('enpoi-orchestration')

export const CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({}),
})

export function apply(ctx: Context): void {
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

  // 2. Invariant B3: Dynamic runtime-context snapshot line via native systemPrompt.context seam
  const sysPrompt = ctx.get('systemPrompt') as {
    context: (context: { name: string; order: number; text: () => string }) => () => void
  } | undefined

  if (sysPrompt) {
    const disposeContext = sysPrompt.context({
      name: 'enpoi-capabilities',
      order: 85,
      text: () => formatCapabilitiesSnapshot(initialCapabilitiesState(getGlobalDefaults())),
    })
    ctx.effect(() => disposeContext, 'enpoi-capabilities: runtime context snapshot')
  }

  // 2b. MCP mounting (B5): capabilities.mcp[id]===true spawns a live mcp-client
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

    /** Resolve apiKeyEnv: process.env first, then ~/.dsh/.credentials.yaml refs (never logged). */
    function resolveCredential(name: string | undefined): string | undefined {
      if (!name) return undefined
      if (process.env[name]) return process.env[name]
      try {
        const raw = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, 'utf8')
        const m = raw.match(new RegExp(`^\\s{2}${name}:\\s*(.+)$`, 'm'))
        return m?.[1]?.trim()
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
          const apiKey = resolveCredential(def.apiKeyEnv)
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

    // 2c. Reachability heartbeat (Adam): liveness of each catalog server,
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
        const apiKey = resolveCredential(def.apiKeyEnv)
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
  ctx.on('agent/pre-step', (async (_params: unknown, next: (...args: unknown[]) => Promise<unknown>) => {
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

    const filtered = messages.map((msg: { source?: unknown; content?: unknown }) => {
      const source = msg.source as { kind?: string } | undefined
      if (source?.kind !== 'skill-catalog') return msg
      const content = msg.content
      if (!Array.isArray(content)) return msg
      const newContent = content.map((block: { type?: string; text?: string }) => {
        if (block.type !== 'text' || typeof block.text !== 'string') return block
        const lines = block.text.split('\n')
        const kept = lines.filter(line => {
          const m = line.match(/^- `([^`]+)`:/)
          if (!m) return true
          return !disabledSkillIds.has(m[1])
        })
        return { ...block, text: kept.join('\n') }
      })
      return { ...msg, content: newContent }
    })
    return { ...decision, messages: filtered }
  }) as (...args: unknown[]) => unknown)
}

export type { CapabilitiesState, CapabilityDescriptor, CapabilityKind } from './types'
export { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
export { initialCapabilitiesState } from './state'
export { evaluateToolCall, formatCapabilitiesSnapshot } from './enforcement'
