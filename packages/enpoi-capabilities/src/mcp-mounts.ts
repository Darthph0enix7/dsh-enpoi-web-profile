/**
 * dsh-enpoi-capabilities — MCP on-demand mounting model.
 *
 * Persistent config says what a server IS (configured + allowed + mode);
 * the agent's mounts are SESSION-scoped and durable through the session log:
 * the `mcp/mounts` event carries the complete post-change set and the
 * `mcpMounts` projection folds it, so a resumed session comes back with
 * exactly the servers it had mounted. Always-on servers are implicitly
 * mounted for every session; on-demand servers are never auto-connected.
 *
 * @module dsh-enpoi-capabilities/mcp-mounts
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Durable session-scoped MCP mount change. Carries the complete
     * post-change set; `ignorable` so a build that predates this event can
     * still read the log.
     */
    'mcp/mounts': { mounted: string[] }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Mounted-server state for one session. */
    mcpMounts: McpMountsProjectionState
  }
  interface SessionProjectionMap {
    /** Client-visible mounted-server set (the session header chip reads it). */
    mcpMounts: McpMountsProjectionState
  }
}

/** Host fold state of the `mcpMounts` unit. */
export interface McpMountsProjectionState {
  /** Mounted server ids (catalog keys). */
  readonly mounted: readonly string[]
}

const mcpMountsStateSchema: z.ZodType<McpMountsProjectionState> = z.object({
  mounted: z.array(z.string().min(1)),
})

/**
 * Fold one committed session event into the mounted-set state.
 * @param state - the state covering all prior events.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not ours).
 */
export function applyMcpMountsProjection(
  state: McpMountsProjectionState,
  event: SessionEvent,
): McpMountsProjectionState {
  if (event.type !== 'mcp/mounts') return state
  return { mounted: [...new Set(event.data.mounted)] }
}

/** The `mcpMounts` projection unit registered by the plugin. */
export const mcpMountsProjection: ProjectionDefinition<'mcpMounts', McpMountsProjectionState> = {
  key: 'mcpMounts',
  // The profile's zod instance differs from the harness's; the projection
  // registry validates with its own copy, so the schema crosses as-is.
  stateSchema: mcpMountsStateSchema as never,
  init: () => ({ mounted: [] }),
  apply: applyMcpMountsProjection,
  // Client-visible: the session header chip renders the mounted set.
  wire: { viewSchema: mcpMountsStateSchema, view: state => state },
  stateVersion: 1,
}

/** Session-event name appended when the mounted set changes. */
export const MCP_MOUNTS_EVENT = 'mcp/mounts'

/** How a configured server participates in mounting. */
export type McpServerMode = 'always-on' | 'on-demand'

/** One catalog entry as this module reads it. */
export interface McpServerRecord {
  serverName?: string
  url?: string
  mode?: string
}

/** The mode of one catalog entry; absent means always-on (pre-existing behavior). */
export function serverModeOf(record: McpServerRecord | undefined): McpServerMode {
  return record?.mode === 'on-demand' ? 'on-demand' : 'always-on'
}

/** Whether one catalog entry is on-demand (never auto-mounted). */
export function isOnDemand(record: McpServerRecord | undefined): boolean {
  return serverModeOf(record) === 'on-demand'
}

/** The mounted namespace of one catalog entry (`serverName ?? id minus '-mcp'`). */
export function serverNameOf(id: string, record: McpServerRecord | undefined): string {
  return record?.serverName ?? id.replace(/-mcp$/, '')
}

/** The server segment of one `mcp__<server>__<tool>` name, or undefined. */
export function mcpServerOfToolName(name: string): string | undefined {
  if (!name.startsWith('mcp__')) return undefined
  const rest = name.slice('mcp__'.length)
  const separator = rest.indexOf('__')
  return separator <= 0 ? undefined : rest.slice(0, separator)
}

/** One row of the `mcp list` action. */
export interface McpMountRow {
  id: string
  serverName: string
  mode: McpServerMode
  state: 'mounted' | 'available' | 'unavailable'
  reason: string
  toolCount: number
}

/**
 * Build the `mcp list` rows.
 * @param catalog - the configured servers.
 * @param allowed - ids whose `capabilities.mcp[id]` is true.
 * @param mounted - ids mounted for this session (always-on servers included).
 * @param errors - last mount failure per id.
 * @param toolNames - every registered tool name.
 * @returns one row per configured server, sorted by id.
 */
export function buildMountRows(
  catalog: Record<string, McpServerRecord>,
  allowed: ReadonlySet<string>,
  mounted: ReadonlySet<string>,
  errors: ReadonlyMap<string, string>,
  toolNames: readonly string[],
): McpMountRow[] {
  const counts = new Map<string, number>()
  for (const name of toolNames) {
    const server = mcpServerOfToolName(name)
    if (server === undefined) continue
    counts.set(server, (counts.get(server) ?? 0) + 1)
  }
  return Object.entries(catalog)
    .map(([id, record]) => {
      const serverName = serverNameOf(id, record)
      const toolCount = counts.get(serverName) ?? 0
      const error = errors.get(id)
      const state: McpMountRow['state'] = mounted.has(id)
        ? 'mounted'
        : !allowed.has(id)
          ? 'unavailable'
          : record.url === undefined || record.url === ''
            ? 'unavailable'
            : error !== undefined
              ? 'unavailable'
              : 'available'
      const reason = mounted.has(id)
        ? ''
        : !allowed.has(id)
          ? 'not allowed: capabilities.mcp.' + id + ' is not true'
          : record.url === undefined || record.url === ''
            ? 'no url configured'
            : error ?? ''
      return { id, serverName, mode: serverModeOf(record), state, reason, toolCount }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}
