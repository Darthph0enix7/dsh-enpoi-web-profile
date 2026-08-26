/**
 * enpoi-capabilities — Execution boundary enforcement & runtime context snapshot.
 *
 * Implements:
 * - Invariant B1: Pre-dispatch waterfall denial for disabled tools, subagents, and skills.
 * - Invariant B3: Dynamic runtime-context snapshot line (KV-cache safe; persona remains frozen).
 */

import type { CapabilitiesState } from './types'
import { PROTECTED_CAPABILITIES } from './types'

export interface PreDispatchDecision {
  allowed: boolean
  syntheticResult?: string
}

/**
 * Evaluates whether a tool call is permitted by the active capability state.
 * Enforces denial at the execution boundary (Invariant B1).
 */
export function evaluateToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
  state: CapabilitiesState,
): PreDispatchDecision {
  // Invariant I15: Protected infrastructure always allowed
  if (PROTECTED_CAPABILITIES.has(toolName)) {
    return { allowed: true }
  }

  // 1. Check direct tool / subagent name (e.g. oracle_review, roundtable, chorus, edit, bash)
  if (state.tools[toolName] === false) {
    return {
      allowed: false,
      syntheticResult: `[CAPABILITY_DISABLED] Tool '${toolName}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`,
    }
  }

  // 2. Check specialist worker dispatch via dispatch_task({ subagent_type })
  if (toolName === 'dispatch_task' && args && typeof args.subagent_type === 'string') {
    const worker = args.subagent_type.toLowerCase().trim()
    if (state.tools[worker] === false) {
      return {
        allowed: false,
        syntheticResult: `[CAPABILITY_DISABLED] Subagent worker '${worker}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`,
      }
    }
  }

  // 3. Check skill loader tool dispatch via skill({ name })
  if (toolName === 'skill' && args && typeof args.name === 'string') {
    const skillName = args.name.toLowerCase().trim()
    if (state.skills[skillName] === false) {
      return {
        allowed: false,
        syntheticResult: `[SKILL_DISABLED] Skill '${skillName}' is currently disabled by operator preference for this query. Do not attempt to load it in this turn.`,
      }
    }
  }

  // 4. Check MCP tool suite dispatch (e.g. mcp__plane__*, mcp__ue__*, mcp__unreal__*)
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    const serverPrefix = parts[1]?.toLowerCase()
    if (serverPrefix) {
      // Match against known MCP IDs
      const mcpKey = serverPrefix === 'plane' ? 'plane-mcp' : serverPrefix === 'ue' || serverPrefix === 'unreal' ? 'ue-mcp' : `${serverPrefix}-mcp`
      if (state.mcp[mcpKey] === false || state.mcp[serverPrefix] === false) {
        return {
          allowed: false,
          syntheticResult: `[CAPABILITY_DISABLED] MCP Tool suite '${mcpKey}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Builds the runtime-context snapshot line for capability visibility.
 * Kept concise and cache-friendly (Invariant B3).
 */
export function formatCapabilitiesSnapshot(state: CapabilitiesState): string {
  const disabledTools = Object.entries(state.tools)
    .filter(([id, enabled]) => !enabled && !PROTECTED_CAPABILITIES.has(id))
    .map(([id]) => id)

  const disabledSkills = Object.entries(state.skills)
    .filter(([, enabled]) => !enabled)
    .map(([id]) => id)

  const disabledMcp = Object.entries(state.mcp)
    .filter(([, enabled]) => !enabled)
    .map(([id]) => id)

  const allDisabled = [...disabledTools, ...disabledSkills, ...disabledMcp]
  if (allDisabled.length === 0) {
    return 'All capabilities, subagents, and skills active.'
  }

  return `Disabled Capabilities (for this query): [${allDisabled.join(', ')}]. Note: These capabilities are disabled by operator preference for the current query only (do not attempt to invoke them). When re-enabled by the operator in future queries, they become available again.`
}
