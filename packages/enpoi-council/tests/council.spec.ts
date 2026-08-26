import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  textOfContent,
  createTraceContext,
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

describe('enpoi-council / engine — Token & Text Helpers', () => {
  it('estimates token counts conservatively (~4 chars/token)', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('extracts text from plain string, arrays, and structured content blocks', () => {
    expect(textOfContent('plain text')).toBe('plain text')
    expect(textOfContent(['a', 'b', 'c'])).toBe('a b c')
    expect(textOfContent([{ text: 'block 1' }, { text: 'block 2' }])).toBe('block 1 block 2')
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
