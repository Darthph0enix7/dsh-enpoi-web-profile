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
import type { CapabilitiesState } from './types'
import { KNOWN_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import { evaluateToolCall, formatCapabilitiesSnapshot } from './enforcement'

export const name = 'enpoi-capabilities'
export const inject = ['tools', 'systemPrompt', 'settings']

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
    const disabledSkillIds = new Set(
      KNOWN_CAPABILITIES.filter(cap => cap.kind === 'skill' && state.skills[cap.id] === false).map(cap => cap.id),
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
