/**
 * enpoi-council — Colosseum Dialectic Roundtable debate engine.
 *
 * Implements targeted premise challenges, defend/concede/reframe state machine,
 * Critic scoring & consensus tracking, deterministic stopping, and C3 goal drift detection.
 *
 * @module dsh-enpoi-council/roundtable
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { getBriefService } from 'dsh-enpoi-context-keeper'
import { getCouncilParams } from './params'
import {
  SKEPTIC_SYSTEM,
  ARCHITECT_SYSTEM,
  PRAGMATIST_SYSTEM,
  CRITIC_SYSTEM,
  buildRoundtableRound1Prompt,
  buildRoundtableRound2PlusPrompt,
  buildCriticScoringPrompt,
  buildCriticSynthesisPrompt,
} from './prompts'
import {
  type DebaterFiberState,
  type DebaterResponse,
  executeParallelRound,
  disposeCouncilFibers,
  startDebaterFiber,
  waitForFiberTurn,
  estimateTokens,
  textOfContent,
} from './engine'
import {
  evaluateStopping,
  extractClaimTokens,
  type CriticScore,
  type StoppingState,
} from './stopping'

export interface RoundtableArgs {
  query: string
  maxRounds?: number
  hideLimit?: boolean
}

export interface RoundtableResult {
  synthesis: string
  roundsRun: number
  consensusRatio: number
  stopReason: string
  totalTokens: number
  modelsUsed: Record<string, string>
  dissents: string[]
}

const DEBATER_SYSTEMS: Record<string, string> = {
  Skeptic: SKEPTIC_SYSTEM,
  Architect: ARCHITECT_SYSTEM,
  Pragmatist: PRAGMATIST_SYSTEM,
}

/** Randomly shuffle array elements (anti-recency bias). */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = temp
  }
  return arr
}

/** Parse critic scoring output safely. */
function parseCriticScore(text: string): CriticScore | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        consensusScore: Number(parsed.consensusScore ?? 0.5),
        qualityScore: Number(parsed.qualityScore ?? 0.5),
        continueDecision: parsed.continueDecision === 'STOP' ? 'STOP' : 'CONTINUE',
        reasonIfStop: typeof parsed.reasonIfStop === 'string' ? parsed.reasonIfStop : null,
        runningBrief: typeof parsed.runningBrief === 'string' ? parsed.runningBrief : '',
      }
    }
  } catch {
    /* fallback to heuristic */
  }
  return null
}

/** Extract Living Brief snapshot text and goalSeq from parent session. */
function getLivingBriefContext(ctx: Context, parent: Agent): { text: string; goalSeq: number } {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections !== undefined) {
      const snap = projections.snapshot(parent.session)
      const lb = snap?.values?.livingBrief
      if (lb) {
        const goal = lb.goal ? `Goal: ${lb.goal}` : ''
        const prose = lb.prose?.text ?? ''
        const decisions = lb.decisions && lb.decisions.length > 0
          ? `Decisions:\n${lb.decisions.map((d: { text: string }) => `• ${d.text}`).join('\n')}`
          : ''
        return {
          text: [goal, prose, decisions].filter(Boolean).join('\n\n'),
          goalSeq: lb.goalSeq ?? 0,
        }
      }
    }
  } catch {
    /* no living brief */
  }
  return { text: '', goalSeq: 0 }
}

/**
 * Run a multi-agent dialectic debate (Roundtable).
 * Hardcoded blocking; pure reasoning over Living Brief + query.
 */
export async function runRoundtable(
  ctx: Context,
  parent: Agent,
  args: RoundtableArgs,
  signal: AbortSignal,
): Promise<RoundtableResult> {
  const startedAt = Date.now()
  // Doc 38: runtime parameters resolved fresh per debate (hot-swap).
  const params = getCouncilParams(ctx)
  const maxRounds = args.maxRounds ?? params.defaultMaxRounds
  const hideLimit = args.hideLimit ?? params.defaultHideLimit

  // Invariant I12: Pin models at start
  const modelsUsed: Record<string, string> = {
    Skeptic: 'flagship',
    Architect: 'flagship',
    Pragmatist: 'flash',
    Critic: 'flagship',
  }

  // Demand-driven cognition (Oracle amendment 6): the prose brief must be
  // materialized BEFORE the debater fibers spawn and council/started is
  // emitted — the frozen brief package and model pinning stay atomic.
  // Soft-degrading: on failure the council proceeds with the deterministic
  // brief + query.
  try {
    await getBriefService()?.ensureFreshBrief(parent.session, signal)
  } catch {
    // Oracle nit: a cancelled caller must not spawn debaters on a dead
    // signal — propagate the abort.
    if (signal.aborted) throw signal.reason ?? new Error('aborted')
  }

  const { text: briefText, goalSeq: initialGoalSeq } = getLivingBriefContext(ctx, parent)

  const debaterFibers: DebaterFiberState[] = [
    { persona: 'Skeptic', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: 'Architect', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: 'Pragmatist', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
  ]

  let criticFiber: DebaterFiberState | null = null

  const stoppingState: StoppingState = {
    round: 1,
    maxRounds,
    hideLimit,
    cumulativeTokens: 0,
    maxTokens: params.maxDebateTokens,
    history: [],
  }

  const roundsTranscript: Array<{
    round: number
    responses: DebaterResponse[]
    critic: CriticScore | null
  }> = []

  let lastCriticBrief = ''
  let finalSynthesis = ''
  let lastStopDecision = { shouldStop: false, reason: '', consensusRatio: 0 }

  try {
    // ── MAIN DEBATE LOOP ──────────────────────────────────────────────────
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error('roundtable debate cancelled by user')

      stoppingState.round = round
      const isRound1 = round === 1

      // 1. Fan-out to Debaters in parallel
      const responses = await executeParallelRound(
        ctx,
        parent,
        debaterFibers,
        (fiber) => {
          if (isRound1) {
            return buildRoundtableRound1Prompt(args.query, briefText)
          } else {
            // Give debater opponents' statements from previous round (shuffled)
            const prevRound = roundsTranscript[round - 2]
            const opponents = (prevRound?.responses ?? [])
              .filter(r => r.persona !== fiber.persona && !r.error && !r.isConcur)
              .map(r => ({ persona: r.persona, text: r.text }))
            return buildRoundtableRound2PlusPrompt(args.query, shuffle(opponents), lastCriticBrief, round)
          }
        },
        isRound1,
        DEBATER_SYSTEMS,
        signal,
        { quorumFraction: params.quorumFraction, debaterRetryCount: params.debaterRetryCount, debaterTimeoutMs: params.debaterTimeoutMs },
      )

      if (signal.aborted) throw new Error('roundtable debate cancelled by user')

      // Accumulate tokens
      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens
      }

      // Collect all claims from this round
      const roundClaimsText = responses.map(r => r.text).join(' ')
      const currentClaims = extractClaimTokens(roundClaimsText)

      // 2. Score with Critic
      const roundTranscriptText = responses
        .map(r => `### ${r.persona}:\n${r.text}`)
        .join('\n\n')

      const consensusHistory = stoppingState.history.map(h => h.consensusRatio)
      const criticPrompt = buildCriticScoringPrompt(args.query, round, roundTranscriptText, consensusHistory)

      let criticScore: CriticScore | null = null

      if (criticFiber === null) {
        criticFiber = await startDebaterFiber(ctx, parent, 'Critic', CRITIC_SYSTEM, criticPrompt, signal)
      } else {
        await ctx.subagents.followup(parent, criticFiber.childId as any, [{ type: 'text', text: criticPrompt }], {
          source: { kind: 'user' },
          signal,
        })
      }

      const criticText = await waitForFiberTurn(ctx, criticFiber.childId, signal, params.debaterTimeoutMs)
      stoppingState.cumulativeTokens += estimateTokens(criticText)
      criticScore = parseCriticScore(criticText)
      if (criticScore?.runningBrief) {
        lastCriticBrief = criticScore.runningBrief
      }

      roundsTranscript.push({
        round,
        responses,
        critic: criticScore,
      })

      // 3. Evaluate Stopping Rules (Deterministic Jaccard delta + Consensus)
      const decision = evaluateStopping(stoppingState, criticScore, currentClaims, { consensusThreshold: params.consensusThreshold, plateauDeltaThreshold: params.plateauDeltaThreshold })
      stoppingState.history.push({
        round,
        claims: currentClaims,
        consensusRatio: decision.consensusRatio,
      })

      lastStopDecision = decision

      if (decision.shouldStop) {
        break
      }
    }

    if (signal.aborted) throw new Error('roundtable debate cancelled by user')

    // ── FINAL SYNTHESIS ───────────────────────────────────────────────────
    // C3 Goal Drift check
    const { goalSeq: finalGoalSeq } = getLivingBriefContext(ctx, parent)
    const driftWarning = finalGoalSeq > initialGoalSeq
      ? `[DRIFT WARNING: The session goal changed during deliberation (seq ${initialGoalSeq} -> ${finalGoalSeq})]`
      : null

    const allRoundsText = roundsTranscript
      .map(r => `## Round ${r.round}\n` + r.responses.map(d => `### ${d.persona}:\n${d.text}`).join('\n\n'))
      .join('\n\n---\n\n')

    const synthPrompt = buildCriticSynthesisPrompt(args.query, allRoundsText, driftWarning)

    if (criticFiber !== null) {
      await ctx.subagents.followup(parent, criticFiber.childId as any, [{ type: 'text', text: synthPrompt }], {
        source: { kind: 'user' },
        signal,
      })
      finalSynthesis = await waitForFiberTurn(ctx, criticFiber.childId, signal, params.debaterTimeoutMs)
      stoppingState.cumulativeTokens += estimateTokens(finalSynthesis)
    } else {
      finalSynthesis = `## Council Decision\n\nDebate completed after ${stoppingState.round} rounds.\n\n${allRoundsText}`
    }

    // Extract any persistent dissents
    const dissents: string[] = []
    const dissentMatches = finalSynthesis.matchAll(/\[DISSENT:([^\]]+)\]\s*\*\*([^*]+)\*\*:\s*"([^"]+)"/g)
    for (const m of dissentMatches) {
      dissents.push(`[${m[2]}]: ${m[3]}`)
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
    const consensusSparkline = stoppingState.history.map(h => h.consensusRatio.toFixed(2)).join(' ──► ')

    const footer = [
      `\n\n---`,
      `*High Council Debate completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Consensus Trajectory: ${consensusSparkline} | Why stopped: ${lastStopDecision.reason}*`,
    ].join('\n')

    return {
      synthesis: finalSynthesis + footer,
      roundsRun: stoppingState.round,
      consensusRatio: lastStopDecision.consensusRatio,
      stopReason: lastStopDecision.reason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed,
      dissents,
    }
  } finally {
    // Teardown all fibers cleanly (ephemeral: true)
    const allFibers = [...debaterFibers]
    if (criticFiber !== null) allFibers.push(criticFiber)
    await disposeCouncilFibers(ctx, allFibers)
  }
}
