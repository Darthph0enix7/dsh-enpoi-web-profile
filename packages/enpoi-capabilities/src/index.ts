/**
 * enpoi-capabilities — Capabilities Control Center plugin (Global Management).
 *
 * Implements:
 * - B1: Execution-level enforcement via monotonic tool guard (`ctx.tools.guard`).
 * - B3: Dynamic runtime-context snapshot line reflecting active/disabled capabilities (KV-cache safe).
 * - I15: Protected infrastructure invariants (contracts, keeper, cascade, living-brief, read, glob, grep).
 * - Activity Bar integration via `betterSidebar.registerTab()`.
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { CapabilitiesState } from './types'
import { PROTECTED_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import { evaluateToolCall, formatCapabilitiesSnapshot } from './enforcement'
import { CapabilitiesDrawer } from './drawer'

export const name = 'enpoi-capabilities'
export const inject = ['tools', 'systemPrompt', 'settings']

const ORCH_NS = settingsNamespace('enpoi-orchestration')

export const CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({}),
})

export function apply(ctx: Context): void {
  function getGlobalState(): CapabilitiesState {
    try {
      const settings = ctx.get('settings') as { get?: (ns: unknown) => { capabilities?: Partial<CapabilitiesState> } } | undefined
      const globalDefaults = settings?.get?.(ORCH_NS)?.capabilities
      return initialCapabilitiesState(globalDefaults)
    } catch {
      return initialCapabilitiesState()
    }
  }

  // 1. Invariant B1: Monotonic pre-dispatch tool execution guard
  const disposeGuard = ctx.tools.guard((exec) => {
    const state = getGlobalState()
    const decision = evaluateToolCall(exec.name, exec.arguments as Record<string, unknown> | undefined, state)
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
      text: () => formatCapabilitiesSnapshot(getGlobalState()),
    })
    ctx.effect(() => disposeContext, 'enpoi-capabilities: runtime context snapshot')
  }

  // 3. Register right activity bar tab if betterSidebar is available
  ctx.inject(['betterSidebar'], (scope) => {
    const betterSidebar = scope.get('betterSidebar') as {
      registerTab?: (descriptor: { id: string; title: string; component: unknown }) => () => void
    } | undefined

    try {
      const disposeTab = betterSidebar?.registerTab?.({
        id: 'capabilities',
        title: 'Capabilities & Tools',
        component: CapabilitiesDrawer,
      })
      if (typeof disposeTab === 'function') {
        ctx.effect(() => disposeTab, 'enpoi-capabilities: activity tab')
      }
    } catch {
      // Graceful fallback if sidebar tab already registered
    }
  })
}

export type { CapabilitiesState, CapabilityDescriptor, CapabilityKind } from './types'
export { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
export { initialCapabilitiesState } from './state'
export { evaluateToolCall, formatCapabilitiesSnapshot } from './enforcement'
export { CapabilitiesDrawer } from './drawer'
