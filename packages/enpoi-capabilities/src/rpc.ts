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
import { mcpToolNames, removeMcpServerFenced, type McpCatalogSettings, type McpToolsView } from './mcp-tools'

/** The live tool registry as this RPC reads it. */
interface ToolSchemaSource {
  schemas?: () => Array<{ name: string }>
}

/**
 * The live-capabilities remote namespace: `enpoiCapabilities.mcpTools()` over
 * the shared Typert Gateway. Every method reads fresh per call — the client
 * never caches a mount state.
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
