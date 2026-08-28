/**
 * enpoi-council — runtime parameters (doc 38).
 *
 * All tunable council parameters resolve from the `enpoi-orchestration`
 * settings namespace (`parameters.council`) with the doc-38 defaults as
 * fallback. Resolved FRESH per debate start (hot-swap: a settings change
 * takes effect on the next roundtable/chorus invocation — no restart).
 *
 * @module dsh-enpoi-council/params
 */

import type { Context } from '@deepseek-ai/cordis'

export interface CouncilParams {
  /** Cumulative session safety token ceiling. */
  maxDebateTokens: number
  /** Default safety round cap (overridable per call via args.maxRounds). */
  defaultMaxRounds: number
  /** Anti-pacing: models are never told the round cap. */
  defaultHideLimit: boolean
  /** Minimum fraction of debater fibers that must respond online. */
  quorumFraction: number
  /** Maximum timeout per debater turn. */
  debaterTimeoutMs: number
  /** Immediate retries if a debater throws or returns empty. */
  debaterRetryCount: number
  /** Consensus ratio that triggers CONSENSUS_REACHED. */
  consensusThreshold: number
  /** Jaccard claim delta below which PLATEAU_DETECTED fires. */
  plateauDeltaThreshold: number
}

export const COUNCIL_PARAM_DEFAULTS: CouncilParams = {
  maxDebateTokens: 180_000,
  defaultMaxRounds: 5,
  defaultHideLimit: true,
  quorumFraction: 2 / 3,
  debaterTimeoutMs: 90_000,
  debaterRetryCount: 1,
  consensusThreshold: 0.8,
  plateauDeltaThreshold: 0.05,
}

/** Read the council parameters fresh from settings (hot-swap, never cached). */
export function getCouncilParams(ctx: Context): CouncilParams {
  const d = COUNCIL_PARAM_DEFAULTS
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => { parameters?: { council?: Partial<CouncilParams> } } } | undefined
    const p = settings?.get?.('enpoi-orchestration')?.parameters?.council
    if (p === undefined || typeof p !== 'object') return d
    return {
      maxDebateTokens: num(p.maxDebateTokens, d.maxDebateTokens, 20_000, 500_000),
      defaultMaxRounds: num(p.defaultMaxRounds, d.defaultMaxRounds, 1, 12),
      defaultHideLimit: typeof p.defaultHideLimit === 'boolean' ? p.defaultHideLimit : d.defaultHideLimit,
      quorumFraction: num(p.quorumFraction, d.quorumFraction, 0.5, 1.0),
      debaterTimeoutMs: num(p.debaterTimeoutMs, d.debaterTimeoutMs, 10_000, 180_000),
      debaterRetryCount: num(p.debaterRetryCount, d.debaterRetryCount, 0, 3),
      consensusThreshold: num(p.consensusThreshold, d.consensusThreshold, 0.5, 1.0),
      plateauDeltaThreshold: num(p.plateauDeltaThreshold, d.plateauDeltaThreshold, 0.01, 0.2),
    }
  } catch {
    return d
  }
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}