/**
 * Real-composition check (no live session, no HTTP): the built plugin against
 * the REAL `ToolRuntime` + `SystemPrompt` services. Proves the two load-bearing
 * facts the live mount depends on:
 *   1. a restriction installed through a scope tagged with the agent key hides
 *      inherited tools from `tools.schemas(agent)` and lifts cleanly;
 *   2. the plugin hides exactly the 12 on-demand members, keeps static tools,
 *      and reveals a group only after `attach` + `turn/end`.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { apply } from '../src/index.js'

const PEER = ['peer_status', 'peer_ask', 'peer_asks', 'peer_answer', 'peer_cancel']
const DEBUG = [
  'diagnostics_report', 'session_debug', 'session_event_read', 'session_event_search',
  'session_event_trace', 'session_search', 'session_trace',
]

function fixtureTool(name: string) {
  return {
    name,
    description: `${name} fixture`,
    parameters: {},
    output: { schema: { type: 'string' }, render: () => [] },
    execute: async () => 'ok',
  }
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  for (const name of [...PEER, ...DEBUG, 'read', 'bash', 'synthetic_ungrouped']) ctx.tools.register(fixtureTool(name) as never)
  return ctx
}

describe('real composition: scope filter + plugin', () => {
  it('hides and restores an inherited tool through a scope tagged with the agent', async () => {
    const ctx = await setup()
    try {
      const agentKey = { id: 'agent-mechanism' }
      let scope: ReturnType<typeof createScope> | undefined
      await ctx.plugin({
        name: 'raw-probe',
        inject: ['tools'],
        apply(probeCtx: any) { scope = createScope(probeCtx, agentKey) },
      } as never)
      expect(ctx.tools.schemas(agentKey).map(tool => tool.name)).toContain('peer_ask')
      const lift = scope!.ctx.tools.restrict({ deny: ['peer_ask'] })
      expect(ctx.tools.schemas(agentKey).map(tool => tool.name)).not.toContain('peer_ask')
      lift()
      expect(ctx.tools.schemas(agentKey).map(tool => tool.name)).toContain('peer_ask')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('hides exactly the on-demand members and reveals an attached group at the turn boundary', async () => {
    const ctx = await setup()
    try {
      const appended: Array<{ type: string; data: any }> = []
      const projected = { attached: null as string[] | null }
      const agent = {
        id: 'agent-plugin',
        session: {
          id: 'session-plugin',
          append: (type: string, data: any) => {
            appended.push({ type, data })
            if (type === 'tool-groups/change') projected.attached = data.attached
          },
        },
      }
      const projections = { stateOf: () => ({ attached: projected.attached }) }
      const settings = {
        get: (ns: string) => (ns === 'enpoi-orchestration'
          ? { toolGroups: { seats: { orchestrator: { preAttach: [] } } } }
          : undefined),
      }
      await ctx.plugin({
        name: 'tool-groups-probe',
        inject: ['tools', 'systemPrompt'],
        apply(probeCtx: any) { apply(probeCtx, { seat: 'orchestrator' }, { projections, settings, log: () => {} }) },
      } as never)

      const definition = ctx.tools.get('tool_groups')
      expect(definition).toBeDefined()
      await definition!.execute({ action: 'list' }, { agent } as never)
      const base = ctx.tools.schemas(agent).map(tool => tool.name)
      expect([...PEER, ...DEBUG].every(name => !base.includes(name))).toBe(true)
      expect(['read', 'bash'].every(name => base.includes(name))).toBe(true)
      // The ungrouped tool is not a group member: it must stay present.
      expect(base).toContain('synthetic_ungrouped')

      await definition!.execute({ action: 'attach', group: 'peer' }, { agent } as never)
      expect(appended.at(-1)).toEqual({ type: 'tool-groups/change', data: { attached: ['peer'] } })

      // Before the boundary the peer tool is not callable: the call must carry
      // the next-turn hint, not a bare UNKNOWN_TOOL.
      const pending = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'c-pending' as never,
        name: 'peer_status',
        arguments: {},
        agent: agent as never,
      })
      expect(pending.isError).toBe(true)
      expect(JSON.stringify(pending.content)).toContain('End your turn now')

      ctx.emit('session/event', agent.session as never, { type: 'turn/end', data: { turn: 1 } } as never)
      const after = ctx.tools.schemas(agent).map(tool => tool.name)
      expect(PEER.every(name => after.includes(name))).toBe(true)
      expect(DEBUG.every(name => !after.includes(name))).toBe(true)
      expect(after).toContain('synthetic_ungrouped')

      const settled = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'c-settled' as never,
        name: 'peer_status',
        arguments: {},
        agent: agent as never,
      })
      expect(settled.isError).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
