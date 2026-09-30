/**
 * The `enpoiCapabilities` Remote namespace owner over the shared Typert
 * Gateway.
 *
 * Kept out of the test import graph: the `@Remote` method decorator is
 * metadata the unit-test transform would have to parse, so the pure
 * projection lives in `mcp-tools.ts` and only the bundle imports this file
 * (dynamically, like the mcp-client mount above it).
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  mcpToolNames, registeredToolNames, removeMcpServerFenced,
  type McpCatalogSettings, type McpToolsView, type RegisteredToolsView,
} from './mcp-tools'

/** The live tool registry as this RPC reads it. */
interface ToolSchemaSource {
  schemas?: () => Array<{ name: string }>
}

/**
 * The live-capabilities remote namespace: `enpoiCapabilities.mcpTools()` and
 * `enpoiCapabilities.registeredTools()` over the shared Typert Gateway. Every
 * method reads fresh per call — the client never caches a mount state.
 */
export class EnpoiCapabilitiesService extends TypertRemoteService {
  /**
   * @param ctx - owning Host Context (the Typert binding is installed by the base).
   */
  constructor(ctx: Context) {
    super(ctx, 'enpoiCapabilities')
  }

  /**
   * Every MCP tool the runtime currently registers, read from the tool
   * registry on each call (`ctx.tools.schemas()`), so mounting or unmounting
   * a server changes the answer immediately. Failure posture is fail-open:
   * an unavailable registry or settings service answers an empty list.
   * @returns the sorted `mcp__<server>__<tool>` public names.
   */
  @Remote
  async mcpTools(): Promise<McpToolsView> {
    try {
      const tools = this.ctx.get('tools') as ToolSchemaSource | undefined
      const schemas = tools?.schemas?.() ?? []
      return { tools: mcpToolNames(schemas.map(schema => schema.name)) }
    } catch {
      // Advisory read: an unavailable registry must not fail the settings page.
      return { tools: [] }
    }
  }

  /**
   * Every tool the runtime currently registers (native, profile plugins, and
   * `mcp__<server>__<tool>` names alike), read fresh from the tool registry on
   * each call (`ctx.tools.schemas()`). The Permissions matrix and the Dynamic
   * → Roles tool grid build their rows from this projection, so any future
   * tool appears automatically. Failure posture is fail-open: an unavailable
   * registry answers an empty list.
   * @returns the sorted unique public tool names.
   */
  @Remote
  async registeredTools(): Promise<RegisteredToolsView> {
    try {
      const tools = this.ctx.get('tools') as ToolSchemaSource | undefined
      const schemas = tools?.schemas?.() ?? []
      return { tools: registeredToolNames(schemas.map(schema => schema.name)) }
    } catch {
      // Advisory read: an unavailable registry must not fail the settings page.
      return { tools: [] }
    }
  }

  /**
   * The servers one session has mounted (always-on servers included), read
   * from the session-scoped mount service. Failure posture is fail-open: an
   * unavailable service answers an empty list.
   * @param sessionId - the session whose mounts are read.
   * @returns the mounted rows with tool counts.
   */
  @Remote
  async mcpMounts(sessionId: string): Promise<{ mounts: Array<{ id: string; serverName: string; toolCount: number }> }> {
    try {
      const service = this.ctx.get('mcpMounts') as
        | { list?: (session: { id: string }) => Array<{ id: string; serverName: string; state: string; toolCount: number }> }
        | undefined
      const rows = service?.list?.({ id: sessionId }) ?? []
      return { mounts: rows.filter(row => row.state === 'mounted').map(row => ({ id: row.id, serverName: row.serverName, toolCount: row.toolCount })) }
    } catch {
      return { mounts: [] }
    }
  }

  /**
   * Unmount one server from one session (the operator's close control on the
   * session surface). The shared connection is disposed when no session holds
   * it and the server is on-demand.
   * @param sessionId - the session to unmount from.
   * @param server - the catalog server id.
   * @returns whether the unmount succeeded, with the reason on failure.
   */
  @Remote
  async mcpUnmount(sessionId: string, server: string): Promise<{ ok: boolean; reason: string }> {
    try {
      const service = this.ctx.get('mcpMounts') as
        | { unmount?: (session: { id: string }, id: string) => Promise<{ ok: boolean; reason: string }> }
        | undefined
      if (service?.unmount === undefined) return { ok: false, reason: 'the mount service is unavailable' }
      return await service.unmount({ id: sessionId }, server)
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Remove one catalog MCP server AND every policy row it owned
   * (`mcp__<server>__*` + exact `mcp__<server>__<tool>` rows, global and per
   * agent) in a single revision-fenced settings write, so the Permissions page
   * never accumulates rows for a server that no longer exists.
   * @param id - the `enpoi-orchestration.mcpServers` catalog key.
   * @returns whether the entry was removed and how many policy rows went with it.
   */
  @Remote
  async removeMcpServer(id: string): Promise<{ removed: boolean; rows: number }> {
    const settings = this.ctx.get('settings') as McpCatalogSettings | undefined
    return await removeMcpServerFenced(settings, id)
  }
}

/**
 * Mount the `enpoiCapabilities` remote namespace on the owning context.
 * @param ctx - owning plugin context.
 */
export function mountCapabilitiesRemote(ctx: Context): void {
  ctx.plugin(EnpoiCapabilitiesService)
}
