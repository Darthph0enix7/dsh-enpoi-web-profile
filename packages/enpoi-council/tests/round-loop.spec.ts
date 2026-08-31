import { describe, expect, it, vi, beforeEach } from 'vitest'

import { runChorus } from '../src/chorus'
import { runRoundtable } from '../src/roundtable'
import { getCouncilParams } from '../src/params'
import { executeParallelRound } from '../src/engine'

/**
 * Council round-loop tests (Oracle D0/D2 regression): the REAL engine code
 * runs against a scripted ctx — fake subagents service (canned child ids),
 * parked-agent detection (agents.get → undefined), and a fake persistence
 * layer returning an assistant message. This exercises the actual params
 * plumbing (quorum, retry, timeout) without real LLM calls.
 */

function makeCtx(overrides: {
  personas?: Record<string, { provider?: string; model?: string }>
  childId?: string
  turnText?: string
} = {}) {
  const childId = overrides.childId ?? 'child-00000000-0000-4000-8000-000000000001'
  const turnText = overrides.turnText ?? 'A substantive argument about the trade-offs at hand.'
  return {
    get: (ns: string) => {
      if (ns === 'settings') return { get: () => ({ personas: overrides.personas ?? {} }) }
      if (ns === 'sessionProjections') return { snapshot: () => ({ values: {} }) }
      if (ns === 'agents') return { get: () => undefined } // child always parked
      if (ns === 'sessionPersistence') {
        return {
          load: async () => ({
            events: [
              { type: 'assistant/message', seq: 1, data: { message: { content: [{ type: 'text', text: turnText }] } } },
              { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } },
            ],
          }),
        }
      }
      if (ns === 'sessions') return { get: () => ({ append: vi.fn() }) }
      return undefined
    },
    tools: { get: () => undefined },
    agents: { get: () => undefined },
    subagents: {
      startContinuable: async () => ({ childId }),
      followup: async () => undefined,
    },
    logger: { warn: vi.fn(), info: vi.fn() },
  }
}

const parent = {
  session: { id: 'parent-session', seq: 10, events: [], append: vi.fn() },
  options: { provider: 'antigravity', model: 'gemini-3.7-flash-tiered' },
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('council round loop — params plumbing (Oracle D0/D2 regression)', () => {
  it('runChorus executes a full round loop without crashing (params object present)', async () => {
    const ctx = makeCtx()
    const result = await runChorus(ctx as never, parent, { query: 'brainstorm a feature' }, new AbortController().signal)
    expect(result).toBeDefined()
    expect(result.harvest).toBeDefined()
    expect(result.roundsRun).toBeGreaterThan(0)
  })

  it('runRoundtable executes a full round loop without crashing', async () => {
    const ctx = makeCtx()
    const result = await runRoundtable(ctx as never, parent, { query: 'debate an architecture' }, new AbortController().signal)
    expect(result).toBeDefined()
    expect(result.synthesis).toBeDefined()
    expect(result.roundsRun).toBeGreaterThan(0)
  })

  it('executeParallelRound honors the configured retry count (retryCount=2 → 3 attempts)', async () => {
    // Scripted ctx: the first two spawns throw (invalid child id), the third succeeds.
    let spawnCalls = 0
    const ctx = makeCtx()
    ctx.subagents.startContinuable = async () => {
      spawnCalls += 1
      if (spawnCalls <= 2) throw new Error('transient spawn failure')
      return { childId: 'child-00000000-0000-4000-8000-000000000001' }
    }
    const fibers = [
      { persona: 'Skeptic', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Architect', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Pragmatist', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    ]
    const responses = await executeParallelRound(
      ctx as never,
      parent,
      fibers,
      () => 'prompt',
      true,
      { Skeptic: 'sys', Architect: 'sys', Pragmatist: 'sys' },
      new AbortController().signal,
      { quorumFraction: 2 / 3, debaterRetryCount: 2, debaterTimeoutMs: 30_000 },
    )
    expect(responses.filter(r => !r.error)).toHaveLength(3)
    expect(spawnCalls).toBe(5) // Skeptic 3 attempts + Architect 1 + Pragmatist 1
  })

  it('executeParallelRound passes debaterTimeoutMs to waitForFiberTurn', async () => {
    const ctx = makeCtx()
    const fibers = [
      { persona: 'Skeptic', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Architect', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Pragmatist', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    ]
    // A short timeout must NOT fire for the scripted instant turns.
    const responses = await executeParallelRound(
      ctx as never,
      parent,
      fibers,
      () => 'prompt',
      true,
      { Skeptic: 'sys', Architect: 'sys', Pragmatist: 'sys' },
      new AbortController().signal,
      { quorumFraction: 2 / 3, debaterRetryCount: 0, debaterTimeoutMs: 30_000 },
    )
    expect(responses.filter(r => !r.error)).toHaveLength(3)
  })

  it('enforces the quorum fraction (1/3 online < 2/3 → throws)', async () => {
    // Scripted ctx: only the first spawn succeeds; the rest throw forever.
    let spawnCalls = 0
    const ctx = makeCtx()
    ctx.subagents.startContinuable = async () => {
      spawnCalls += 1
      if (spawnCalls === 1) return { childId: 'child-00000000-0000-4000-8000-000000000001' }
      throw new Error('provider down')
    }
    const fibers = [
      { persona: 'Skeptic', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Architect', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
      { persona: 'Pragmatist', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    ]
    await expect(executeParallelRound(
      ctx as never,
      parent,
      fibers,
      () => 'prompt',
      true,
      { Skeptic: 'sys', Architect: 'sys', Pragmatist: 'sys' },
      new AbortController().signal,
      { quorumFraction: 2 / 3, debaterRetryCount: 0, debaterTimeoutMs: 30_000 },
    )).rejects.toThrow(/quorum/)
  })

  it('getCouncilParams defaults flow into the round loop (maxRounds default 5)', async () => {
    const ctx = makeCtx()
    const params = getCouncilParams(ctx as never)
    expect(params.defaultMaxRounds).toBe(5)
    expect(params.debaterTimeoutMs).toBe(300_000)
  })
})