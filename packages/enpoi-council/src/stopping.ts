/**
 * enpoi-council — Pure TypeScript deterministic stopping engine.
 *
 * Implements Jaccard claim delta distance, consensus ratio evaluation,
 * emergency token ceiling enforcement (80k), and heuristic Critic fallbacks.
 * Completely zero LLM hallucination for stopping decisions.
 *
 * @module dsh-enpoi-council/stopping
 */

export interface CriticScore {
  consensusScore: number // 0.0 to 1.0
  qualityScore: number // 0.0 to 1.0
  continueDecision: 'CONTINUE' | 'STOP'
  reasonIfStop: string | null
  runningBrief: string
}

export interface RoundHistoryEntry {
  round: number
  claims: Set<string>
  consensusRatio: number
}

export interface StoppingState {
  round: number
  maxRounds: number
  hideLimit: boolean
  cumulativeTokens: number
  maxTokens: number
  history: RoundHistoryEntry[]
}

export interface StoppingDecision {
  shouldStop: boolean
  reason: string
  stopCode: 'CONSENSUS_REACHED' | 'PLATEAU_DETECTED' | 'TOKEN_CEILING' | 'MAX_ROUNDS' | 'CONTINUE'
  heuristicFallback: boolean
  consensusRatio: number
  delta: number
}

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'with',
  'that', 'this', 'it', 'from', 'be', 'are', 'was', 'were', 'as', 'by', 'of', 'we', 'i',
  'you', 'they', 'he', 'she', 'it', 'our', 'my', 'your', 'their', 'should', 'would',
  'could', 'can', 'will', 'not', 'no', 'but', 'if', 'then', 'so', 'there', 'what',
  'when', 'where', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some',
])

/** Extract normalized claim token set (unigrams + bigrams) from text. */
export function extractClaimTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w))

  const tokens = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    tokens.add(words[i]!)
    if (i < words.length - 1) {
      tokens.add(`${words[i]}_${words[i + 1]}`)
    }
  }
  return tokens
}

/** Compute Jaccard similarity: |A ∩ B| / |A ∪ B| */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0
  if (setA.size === 0 || setB.size === 0) return 0.0

  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return union === 0 ? 1.0 : intersection / union
}

/**
 * Evaluate whether the debate or brainstorm should terminate.
 * Pure deterministic calculation — never trusts unverified LLM output alone.
 */
export function evaluateStopping(
  state: StoppingState,
  criticOutput: CriticScore | null,
  currentClaims: Set<string>,
  thresholds: { consensusThreshold: number; plateauDeltaThreshold: number } = { consensusThreshold: 0.8, plateauDeltaThreshold: 0.05 },
): StoppingDecision {
  const round = state.round

  // 1. Emergency cumulative token ceiling check (Doc 35 §3.2)
  if (state.cumulativeTokens >= state.maxTokens) {
    return {
      shouldStop: true,
      reason: `Emergency token ceiling reached (${state.cumulativeTokens} tokens >= ${state.maxTokens} limit).`,
      stopCode: 'TOKEN_CEILING',
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0,
    }
  }

  // 2. Hard round limit check
  if (round >= state.maxRounds) {
    return {
      shouldStop: true,
      reason: `Maximum rounds limit (${state.maxRounds}) reached.`,
      stopCode: 'MAX_ROUNDS',
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0,
    }
  }

  // 3. Compute Delta from previous round
  const prevEntry = state.history.at(-1)
  const prevClaims = prevEntry?.claims ?? new Set<string>()
  const jaccardSim = calculateJaccardSimilarity(prevClaims, currentClaims)
  // Delta is the rate of NEW information being introduced (1.0 = completely new, 0.0 = identical)
  const delta = 1.0 - jaccardSim
  // Novelty vs ALL previous rounds: the max similarity to any earlier round.
  // A round that mostly repeats ANY earlier round (not just the last) is a
  // plateau signal — creative lenses reword the same themes across rounds.
  const maxSimToAnyPrior = state.history.length > 0
    ? Math.max(...state.history.map(h => calculateJaccardSimilarity(h.claims, currentClaims)))
    : 0
  const noveltyVsAll = 1.0 - maxSimToAnyPrior

  let consensusRatio = 0
  let heuristicFallback = false

  if (criticOutput !== null && typeof criticOutput.consensusScore === 'number' && !isNaN(criticOutput.consensusScore)) {
    consensusRatio = Math.max(0.0, Math.min(1.0, criticOutput.consensusScore))
  } else {
    // Critic fallback: compute consensus from cross-round claim stability
    heuristicFallback = true
    consensusRatio = jaccardSim // high similarity ~ high agreement
  }

  // 4. Consensus reached threshold check (>= consensusThreshold)
  if (consensusRatio >= thresholds.consensusThreshold && round >= 2) {
    return {
      shouldStop: true,
      reason: `Consensus reached (consensus ratio: ${consensusRatio.toFixed(2)} >= ${thresholds.consensusThreshold.toFixed(2)}).`,
      stopCode: 'CONSENSUS_REACHED',
      heuristicFallback,
      consensusRatio,
      delta,
    }
  }

  // 5. Plateau detection check (Delta < plateauDeltaThreshold on Round 3+)
  if (round >= 3 && (delta < thresholds.plateauDeltaThreshold || noveltyVsAll < thresholds.plateauDeltaThreshold)) {
    const prevDelta = state.history.length >= 2
      ? 1.0 - calculateJaccardSimilarity(state.history[state.history.length - 2]!.claims, prevClaims)
      : 1.0

    if (prevDelta < 0.25 || delta < 0.02 || noveltyVsAll < 0.02) {
      return {
        shouldStop: true,
        reason: `Idea generation and debate arguments have plateaued (delta: ${delta.toFixed(3)}, novelty-vs-all: ${noveltyVsAll.toFixed(3)} < ${thresholds.plateauDeltaThreshold.toFixed(2)}).`,
        stopCode: 'PLATEAU_DETECTED',
        heuristicFallback,
        consensusRatio,
        delta,
      }
    }
  }

  // 6. Continue deliberation
  return {
    shouldStop: false,
    reason: `Continuing deliberation (round ${round}, consensus: ${consensusRatio.toFixed(2)}, delta: ${delta.toFixed(3)}).`,
    stopCode: 'CONTINUE',
    heuristicFallback,
    consensusRatio,
    delta,
  }
}
