import { describe, it, expect, vi } from 'vitest'
import {
  estimateTokens,
  textOfContent,
  createTraceContext,
  startDebaterFiber,
  COUNCIL_DENIED_TOOLS,
  COUNCIL_KEPT_TOOLS,
} from '../src/engine'
import {
  buildRoundtableRound1Prompt,
  buildRoundtableRound2PlusPrompt,
  buildCriticScoringPrompt,
  buildCriticSynthesisPrompt,
  buildChorusRound1Prompt,
  buildChorusRound2PlusPrompt,
  buildCuratorHarvestPrompt,
  SKEPTIC_SYSTEM,
  ARCHITECT_SYSTEM,
  PRAGMATIST_SYSTEM,
  CRITIC_SYSTEM,
  VISIONARY_SYSTEM,
  EXPERIENCER_SYSTEM,
  INTEGRATOR_SYSTEM,
  CURATOR_SYSTEM,
} from '../src/prompts'

describe('enpoi-council / engine — I14 pure-reasoning tool filter', () => {
  const NEWLY_DENIED = [
    'workflow', 'ralph',
    'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode', 'plan_mode', 'goal',
    'job_output', 'job_list', 'job_kill',
    'skill', 'ask_user_question',
  ]

  it('denies every execution/orchestration escape (live-inventory regression)', () => {
    for (const name of NEWLY_DENIED) {
      expect(COUNCIL_DENIED_TOOLS).toContain(name)
    }
    // Historical denials must remain.
    for (const name of ['send_message', 'subagent', 'dispatch_task', 'bash', 'edit', 'write']) {
      expect(COUNCIL_DENIED_TOOLS).toContain(name)
    }
  })

  it('keeps the read-only research surface: no kept tool is denied', () => {
    expect(COUNCIL_KEPT_TOOLS).toEqual([
      'read', 'glob', 'grep', 'read_image', 'web_search', 'web_fetch',
    ])
    for (const name of COUNCIL_KEPT_TOOLS) {
      expect(COUNCIL_DENIED_TOOLS).not.toContain(name)
    }
  })

  it('emits the full deny list unconditionally in the spawned fiber toolFilter', async () => {
    let emitted: { deny?: string[] } | undefined
    const ctx = {
      get: (ns: string) => {
        if (ns === 'settings') return { get: () => ({ personas: {} }) }
        if (ns === 'sessions') return { get: () => ({ append: vi.fn() }) }
        return undefined
      },
      subagents: {
        startContinuable: async (opts: { request: { toolFilter?: { deny?: string[] } } }) => {
          emitted = opts.request.toolFilter
          return { childId: 'child-00000000-0000-4000-8000-000000000001' }
        },
      },
      logger: { warn: vi.fn(), info: vi.fn() },
    }
    const parent = {
      session: { id: 'parent-session', seq: 10, events: [], append: vi.fn() },
      options: { provider: 'antigravity', model: 'gemini-3.7-flash-tiered' },
    }

    await startDebaterFiber(
      ctx as never,
      parent as never,
      'Skeptic',
      'system prompt',
      'initial prompt',
      new AbortController().signal,
    )

    expect(emitted).toBeDefined()
    expect(emitted?.deny).toEqual(COUNCIL_DENIED_TOOLS)
    for (const name of NEWLY_DENIED) {
      expect(emitted?.deny).toContain(name)
    }
    for (const name of COUNCIL_KEPT_TOOLS) {
      expect(emitted?.deny).not.toContain(name)
    }
  })
})

describe('enpoi-council / engine — Token & Text Helpers', () => {
  it('estimates token counts conservatively (~4 chars/token)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('extracts report text only, excluding reasoning blocks', () => {
    expect(textOfContent('plain text')).toBe('plain text')
    expect(textOfContent(['a', 'b', 'c'])).toBe('a\nb\nc')
    // Untyped blocks are legacy plain text and stay admissible.
    expect(textOfContent([{ text: 'block 1' }, { text: 'block 2' }])).toBe('block 1\nblock 2')
    // A reasoning block is private deliberation and never reaches the parent.
    expect(textOfContent([
      { type: 'reasoning', text: 'private deliberation' },
      { type: 'text', text: 'the report' },
    ])).toBe('the report')
    expect(textOfContent([{ type: 'tool-call', callId: 'c1', name: 'noop', argsRaw: '{}' }])).toBe('')
    expect(textOfContent(null)).toBe('')
    expect(textOfContent(undefined)).toBe('')
  })

  it('creates unique and valid TraceContext records', () => {
    const mockSession = { id: 'session-123', seq: 42 } as any
    const trace = createTraceContext('Skeptic', mockSession, 'run-abc', 1)
    expect(trace.traceId).toContain('trace-')
    expect(trace.persona).toBe('Skeptic')
    expect(trace.parentSeq).toBe(42)
    expect(trace.seq).toBe(1)
  })
})

describe('enpoi-council / prompts — Colosseum Protocol & Prompts', () => {
  it('all debater and lens system prompts encode pure reasoning and concise bounds', () => {
    for (const prompt of [
      SKEPTIC_SYSTEM,
      ARCHITECT_SYSTEM,
      PRAGMATIST_SYSTEM,
      CRITIC_SYSTEM,
      VISIONARY_SYSTEM,
      EXPERIENCER_SYSTEM,
      INTEGRATOR_SYSTEM,
      CURATOR_SYSTEM,
    ]) {
      expect(prompt.length).toBeGreaterThan(100)
      expect(prompt).not.toContain('toolFilter') // meta instructions not leaked
    }
    // Colosseum protocol terms
    expect(SKEPTIC_SYSTEM).toContain('CONCEDE')
    expect(SKEPTIC_SYSTEM).toContain('DEFEND')
    expect(SKEPTIC_SYSTEM).toContain('CONCUR')
    expect(ARCHITECT_SYSTEM).toContain('CONCUR')
    expect(PRAGMATIST_SYSTEM).toContain('CONCUR')
  })

  it('builds Round 1 and Round 2+ prompts correctly', () => {
    const r1 = buildRoundtableRound1Prompt('Should we use Redis or SQLite?', 'Living brief context here')
    expect(r1).toContain('Should we use Redis or SQLite?')
    expect(r1).toContain('Living brief context here')
    expect(r1).toContain('ROUND 1: INITIAL THESES')

    const r2 = buildRoundtableRound2PlusPrompt(
      'Should we use Redis or SQLite?',
      [{ persona: 'Architect', text: 'Use Redis for distributed sync' }],
      'Critic running brief summary',
      2,
    )
    expect(r2).toContain('ROUND 2: COLOSSEUM INTERROGATION')
    expect(r2).toContain('Critic running brief summary')
    expect(r2).toContain('Architect')
    expect(r2).toContain('Use Redis for distributed sync')
  })

  it('builds Critic scoring and synthesis prompts with drift warning support', () => {
    const scorePrompt = buildCriticScoringPrompt('Dilemma query', 2, 'Transcript text', [0.4, 0.6])
    expect(scorePrompt).toContain('consensusScore')
    expect(scorePrompt).toContain('continueDecision')

    const synthPrompt = buildCriticSynthesisPrompt('Dilemma query', 'Rounds data text', '[DRIFT WARNING: Goal shifted]')
    expect(synthPrompt).toContain('[DRIFT WARNING: Goal shifted]')
    expect(synthPrompt).toContain('## 🎯 Executive Verdict')
    expect(synthPrompt).toContain('[DISSENT:')
  })

  it('builds Chorus brainstorm prompts correctly', () => {
    const c1 = buildChorusRound1Prompt('Design a voice assistant', 'Brief')
    expect(c1).toContain('ROUND 1: EXPLORATION & POSSIBILITIES')

    const c2 = buildChorusRound2PlusPrompt('Design a voice assistant', 'Curator brief', ['Gem 1', 'Gem 2'], 2)
    expect(c2).toContain('ROUND 2: CROSS-POLLINATION & EVOLUTION')
    expect(c2).toContain('Gem 1')
    expect(c2).toContain('Gem 2')

    const harvest = buildCuratorHarvestPrompt('Design a voice assistant', 'Rounds data')
    expect(harvest).toContain('## 🌟 Spotlight Gems')
    expect(harvest).toContain('## 🚀 Execution Matrix: Buildable Now vs. Horizon Moonshots')
  })
})

describe('reserved PTC transport', () => {
  it('never names run_code in the deny list (tools.restrict() throws on it)', () => {
    expect(COUNCIL_DENIED_TOOLS).not.toContain('run_code')
  })
})
