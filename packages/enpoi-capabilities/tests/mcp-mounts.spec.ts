// mcp-mounts.spec.ts — the on-demand mounting model: projection fold, modes,
// tool-name mapping, and the `mcp list` rows.

import { describe, it, expect } from 'vitest'
import {
  applyMcpMountsProjection, buildMountRows, isOnDemand, mcpServerOfToolName,
  serverModeOf, serverNameOf, type McpMountsProjectionState,
} from '../src/mcp-mounts'

const EMPTY: McpMountsProjectionState = { mounted: [] }

describe('mcpMounts projection', () => {
  it('folds the complete post-change set and dedupes', () => {
    const next = applyMcpMountsProjection(EMPTY, { type: 'mcp/mounts', data: { mounted: ['a', 'b', 'a'] } } as never)
    expect(next.mounted).toEqual(['a', 'b'])
  })

  it('ignores other events and keeps the same reference', () => {
    const state = { mounted: ['a'] }
    expect(applyMcpMountsProjection(state, { type: 'tool-groups/change', data: { attached: [] } } as never)).toBe(state)
  })
})

describe('server modes', () => {
  it('defaults to always-on and reads on-demand explicitly', () => {
    expect(serverModeOf({})).toBe('always-on')
    expect(serverModeOf({ mode: 'on-demand' })).toBe('on-demand')
    expect(serverModeOf({ mode: 'always-on' })).toBe('always-on')
    expect(isOnDemand({ mode: 'on-demand' })).toBe(true)
    expect(isOnDemand(undefined)).toBe(false)
  })

  it('resolves the mounted namespace', () => {
    expect(serverNameOf('unreal-mcp', {})).toBe('unreal')
    expect(serverNameOf('unreal-mcp', { serverName: 'ue' })).toBe('ue')
    expect(serverNameOf('github', {})).toBe('github')
  })
})

describe('mcpServerOfToolName', () => {
  it('extracts the server segment and ignores other names', () => {
    expect(mcpServerOfToolName('mcp__unreal__spawn_actor')).toBe('unreal')
    expect(mcpServerOfToolName('mcp__github__create_issue')).toBe('github')
    expect(mcpServerOfToolName('bash')).toBeUndefined()
    expect(mcpServerOfToolName('mcp__broken')).toBeUndefined()
  })
})

describe('buildMountRows', () => {
  const catalog = {
    'unreal-mcp': { url: 'http://127.0.0.1:9999/mcp', mode: 'on-demand' },
    github: { url: 'http://127.0.0.1:9998/mcp' },
    broken: { url: 'http://127.0.0.1:9997/mcp', mode: 'on-demand' },
    'no-url': { mode: 'on-demand' },
  }
  const tools = ['mcp__unreal__spawn_actor', 'mcp__unreal__list_actors', 'mcp__github__create_issue', 'bash']

  it('reports mounted, available, and unavailable with reasons and counts', () => {
    const rows = buildMountRows(
      catalog,
      new Set(['unreal-mcp', 'github', 'broken', 'no-url']),
      new Set(['unreal-mcp', 'github']),
      new Map([['broken', 'connect ECONNREFUSED']]),
      tools,
    )
    expect(rows.map(row => [row.id, row.state])).toEqual([
      ['broken', 'unavailable'],
      ['github', 'mounted'],
      ['no-url', 'unavailable'],
      ['unreal-mcp', 'mounted'],
    ])
    expect(rows.find(row => row.id === 'unreal-mcp')).toMatchObject({ mode: 'on-demand', toolCount: 2, reason: '' })
    expect(rows.find(row => row.id === 'github')).toMatchObject({ mode: 'always-on', toolCount: 1 })
    expect(rows.find(row => row.id === 'broken')?.reason).toContain('ECONNREFUSED')
    expect(rows.find(row => row.id === 'no-url')?.reason).toContain('no url')
  })

  it('marks a disallowed server unavailable with the toggle named', () => {
    const rows = buildMountRows(catalog, new Set(['github']), new Set(), new Map(), tools)
    expect(rows.find(row => row.id === 'unreal-mcp')).toMatchObject({ state: 'unavailable' })
    expect(rows.find(row => row.id === 'unreal-mcp')?.reason).toContain('capabilities.mcp.unreal-mcp')
  })
})
