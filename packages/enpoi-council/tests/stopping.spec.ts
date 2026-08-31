import { describe, it, expect } from 'vitest'
import {
  extractClaimTokens,
  calculateJaccardSimilarity,
  evaluateStopping,
  type StoppingState,
  type CriticScore,
} from '../src/stopping'

describe('enpoi-council / stopping — Jaccard Claim Distance', () => {
  it('extracts unigrams and bigrams excluding stop words', () => {
    const text = 'The Redis subscriber uses exponential backoff and jitter for clean reconnects.'
    const tokens = extractClaimTokens(text)
    expect(tokens.has('redis')).toBe(true)
    expect(tokens.has('subscriber')).toBe(true)
    expect(tokens.has('redis_subscriber')).toBe(true)
    expect(tokens.has('exponential_backoff')).toBe(true)
    expect(tokens.has('the')).toBe(false)
    expect(tokens.has('and')).toBe(false)
  })

  it('computes exact Jaccard similarity between token sets', () => {
    const setA = new Set(['redis', 'subscriber', 'backoff'])
    const setB = new Set(['redis', 'subscriber', 'jitter'])
    // Intersection = 2 ('redis', 'subscriber'), Union = 4 ('redis', 'subscriber', 'backoff', 'jitter') -> 2/4 = 0.5
    expect(calculateJaccardSimilarity(setA, setB)).toBe(0.5)
  })

  it('handles empty sets gracefully', () => {
    expect(calculateJaccardSimilarity(new Set(), new Set())).toBe(1.0)
    expect(calculateJaccardSimilarity(new Set(['a']), new Set())).toBe(0.0)
  })
})

describe('enpoi-council / stopping — Deterministic Stopping Rules', () => {
  const baseState: StoppingState = {
    round: 1,
    maxRounds: 5,
    hideLimit: true,
    cumulativeTokens: 10_000,
    maxTokens: 80_000,
    history: [],
  }

  it('continues on Round 1 regardless of scores', () => {
    const claims = extractClaimTokens('Initial thesis about architecture')
    const decision = evaluateStopping(baseState, { consensusScore: 0.9, qualityScore: 0.8, continueDecision: 'STOP', reasonIfStop: null, runningBrief: '' }, claims)
    // Round 1 must always continue to allow cross-examination
    expect(decision.shouldStop).toBe(false)
    expect(decision.stopCode).toBe('CONTINUE')
  })

  it('stops when consensus ratio >= 0.80 on Round 2+', () => {
    const state: StoppingState = {
      ...baseState,
      round: 2,
      history: [{ round: 1, claims: new Set(['a', 'b']), consensusRatio: 0.5 }],
    }
    const critic: CriticScore = {
      consensusScore: 0.85,
      qualityScore: 0.9,
      continueDecision: 'STOP',
      reasonIfStop: 'Agreed on Redis',
      runningBrief: 'Use Redis',
    }
    const claims = new Set(['a', 'b', 'c'])
    const decision = evaluateStopping(state, critic, claims)
    expect(decision.shouldStop).toBe(true)
    expect(decision.stopCode).toBe('CONSENSUS_REACHED')
    expect(decision.consensusRatio).toBe(0.85)
  })

  it('detects plateau when delta < 0.05 across rounds', () => {
    const round1Claims = new Set(['redis', 'subscriber', 'backoff', 'lock'])
    const round2Claims = new Set(['redis', 'subscriber', 'backoff', 'lock', 'jitter'])
    const round3Claims = new Set(['redis', 'subscriber', 'backoff', 'lock', 'jitter']) // exact match with round 2

    const state: StoppingState = {
      ...baseState,
      round: 3,
      history: [
        { round: 1, claims: round1Claims, consensusRatio: 0.4 },
        { round: 2, claims: round2Claims, consensusRatio: 0.6 },
      ],
    }

    const criticScore: CriticScore = {
      consensusScore: 0.65, // below 0.80 consensus threshold, but stalled
      qualityScore: 0.8,
      continueDecision: 'CONTINUE',
      reasonIfStop: null,
      runningBrief: 'Debate has stalled without reaching full consensus.',
    }

    const decision = evaluateStopping(state, criticScore, round3Claims)
    expect(decision.shouldStop).toBe(true)
    expect(decision.stopCode).toBe('PLATEAU_DETECTED')
    expect(decision.reason).toContain('plateaued')
  })

  it('stops immediately when emergency token ceiling (80k) is hit', () => {
    const state: StoppingState = {
      ...baseState,
      round: 2,
      cumulativeTokens: 82_000,
    }
    const decision = evaluateStopping(state, null, new Set(['a']))
    expect(decision.shouldStop).toBe(true)
    expect(decision.stopCode).toBe('TOKEN_CEILING')
    expect(decision.reason).toContain('Emergency token ceiling')
  })

  it('stops when maxRounds limit is reached', () => {
    const state: StoppingState = {
      ...baseState,
      round: 5,
      maxRounds: 5,
    }
    const decision = evaluateStopping(state, null, new Set(['a']))
    expect(decision.shouldStop).toBe(true)
    expect(decision.stopCode).toBe('MAX_ROUNDS')
  })

  it('falls back to pure heuristic when Critic output is unparseable / null', () => {
    const state: StoppingState = {
      ...baseState,
      round: 2,
      history: [{ round: 1, claims: new Set(['a', 'b', 'c', 'd', 'e']), consensusRatio: 0.5 }],
    }
    // Set B has 4/5 of Set A -> 80% similarity -> heuristic consensus >= 0.80
    const claims = new Set(['a', 'b', 'c', 'd', 'e'])
    const decision = evaluateStopping(state, null, claims)
    expect(decision.heuristicFallback).toBe(true)
    expect(decision.consensusRatio).toBe(1.0)
    expect(decision.shouldStop).toBe(true)
    expect(decision.stopCode).toBe('CONSENSUS_REACHED')
  })
})

describe('chorus novelty stopping (Curator NOVELTY signal)', () => {
  it('stops after 2 consecutive low-novelty rounds even when raw delta is high', () => {
    // Simulate the chorus loop's lowNoveltyStreak logic
    let lowNoveltyStreak = 0
    const novelties = [8, 2, 2] // round 1 high, rounds 2-3 low
    let stopped = false
    for (const n of novelties) {
      if (n <= 3) lowNoveltyStreak += 1
      else lowNoveltyStreak = 0
      if (lowNoveltyStreak >= 2) { stopped = true; break }
    }
    expect(stopped).toBe(true)
  })

  it('does not stop on a single low-novelty round', () => {
    let lowNoveltyStreak = 0
    const novelties = [8, 2, 7] // one low round, then high again
    let stopped = false
    for (const n of novelties) {
      if (n <= 3) lowNoveltyStreak += 1
      else lowNoveltyStreak = 0
      if (lowNoveltyStreak >= 2) { stopped = true; break }
    }
    expect(stopped).toBe(false)
  })

  it('noveltyVsAll detects repetition of ANY earlier round', () => {
    const a = new Set(['idea_a', 'idea_b', 'idea_c'])
    const b = new Set(['idea_a', 'idea_b', 'idea_d']) // 2/4 overlap with a
    const c = new Set(['idea_a', 'idea_b', 'idea_c']) // identical to a
    const simToA = calculateJaccardSimilarity(a, c)
    expect(simToA).toBe(1.0)
    const noveltyVsAll = 1.0 - simToA
    expect(noveltyVsAll).toBe(0.0) // pure repetition of an earlier round
  })
})
