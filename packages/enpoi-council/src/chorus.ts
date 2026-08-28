/**
 * enpoi-council — Polyphonic Chorus Brainstorm engine.
 *
 * Implements creative multi-lens ideation (Visionary, Experiencer, Integrator)
 * with Curator deduplication, theme clustering, gem extraction, and plateau detection.
 *
 * @module dsh-enpoi-council/chorus
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { getBriefService } from 'dsh-enpoi-context-keeper'
import { getCouncilParams } from './params'
import {
  VISIONARY_SYSTEM,
  EXPERIENCER_SYSTEM,
  INTEGRATOR_SYSTEM,
  CURATOR_SYSTEM,
  buildChorusRound1Prompt,
  buildChorusRound2PlusPrompt,
  buildCuratorHarvestPrompt,
} from './prompts'
import {
  type DebaterFiberState,
  type DebaterResponse,
  executeParallelRound,
  disposeCouncilFibers,
  startDebaterFiber,
  waitForFiberTurn,
  estimateTokens,
} from './engine'
import {
  evaluateStopping,
  extractClaimTokens,
  type StoppingState,
} from './stopping'

export interface ChorusArgs {
  query: string
  maxRounds?: number
  hideLimit?: boolean
}

export interface ChorusResult {
  harvest: string
  roundsRun: number
  gems: string[]
  stopReason: string
  totalTokens: number
  modelsUsed: Record<string, string>
}

const CHORUS_SYSTEMS: Record<string, string> = {
  Visionary: VISIONARY_SYSTEM,
  Experiencer: EXPERIENCER_SYSTEM,
  Integrator: INTEGRATOR_SYSTEM,
}

/** Extract Living Brief context. */
function getLivingBriefText(ctx: Context, parent: Agent): string {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections !== undefined) {
      const snap = projections.snapshot(parent.session)
      const lb = snap?.values?.livingBrief
      if (lb) {
        return [lb.goal ? `Goal: ${lb.goal}` : '', lb.prose?.text ?? ''].filter(Boolean).join('\n\n')
      }
    }
  } catch {
    /* no living brief */
  }
  return ''
}

/**
 * Run a multi-agent constructive brainstorm (Chorus).
 * Hardcoded blocking; pure reasoning over project context + vision prompt.
 */
export async function runChorus(
  ctx: Context,
  parent: Agent,
  args: ChorusArgs,
  signal: AbortSignal,
): Promise<ChorusResult> {
  const startedAt = Date.now()
  // Doc 38: runtime parameters resolved fresh per brainstorm (hot-swap).
  const params = getCouncilParams(ctx)
  const maxRounds = args.maxRounds ?? params.defaultMaxRounds
  const hideLimit = args.hideLimit ?? params.defaultHideLimit

  const modelsUsed: Record<string, string> = {
    Visionary: 'flagship',
    Experiencer: 'flagship',
    Integrator: 'flash',
    Curator: 'flagship',
  }

  // Demand-driven cognition (Oracle amendment 6): materialize the prose brief
  // BEFORE the lens fibers spawn — the frozen brief package and model pinning
  // stay atomic. Soft-degrading on failure.
  try {
    await getBriefService()?.ensureFreshBrief(parent.session, signal)
  } catch {
    // Oracle nit: a cancelled caller must not spawn lens fibers on a dead
    // signal — propagate the abort.
    if (signal.aborted) throw signal.reason ?? new Error('aborted')
  }

  const briefText = getLivingBriefText(ctx, parent)

  const lensFibers: DebaterFiberState[] = [
    { persona: 'Visionary', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: 'Experiencer', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: 'Integrator', childId: '', isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
  ]

  let curatorFiber: DebaterFiberState | null = null

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
    curatorBrief: string
  }> = []

  let lastCuratorBrief = ''
  let lastGems: string[] = []
  let finalHarvest = ''
  let lastStopReason = 'completed'

  try {
    // ── MAIN CHORUS LOOP ──────────────────────────────────────────────────
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error('chorus brainstorm cancelled by user')

      stoppingState.round = round
      const isRound1 = round === 1

      // 1. Fan-out to Lenses in parallel
      const responses = await executeParallelRound(
        ctx,
        parent,
        lensFibers,
        (_fiber) => {
          if (isRound1) {
            return buildChorusRound1Prompt(args.query, briefText)
          } else {
            return buildChorusRound2PlusPrompt(args.query, lastCuratorBrief, lastGems, round)
          }
        },
        isRound1,
        CHORUS_SYSTEMS,
        signal,
        { quorumFraction: params.quorumFraction, debaterRetryCount: params.debaterRetryCount, debaterTimeoutMs: params.debaterTimeoutMs },
      )

      if (signal.aborted) throw new Error('chorus brainstorm cancelled by user')

      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens
      }

      const roundIdeasText = responses.map(r => r.text).join(' ')
      const currentIdeaTokens = extractClaimTokens(roundIdeasText)

      // 2. Curator Review
      const roundTranscriptText = responses
        .map(r => `### ${r.persona}:\n${r.text}`)
        .join('\n\n')

      const curatorPrompt = `=== CURATOR REVIEW — ROUND ${round} ===
Brainstorm Topic: "${args.query}"

--- Round ${round} Proposals ---
${roundTranscriptText}

Provide:
1. Short 2-3 sentence brief summarizing the newest themes.
2. 1-2 Spotlight Gems from this round (lines starting with "• GEM:").`

      if (curatorFiber === null) {
        curatorFiber = await startDebaterFiber(ctx, parent, 'Curator', CURATOR_SYSTEM, curatorPrompt, signal)
      } else {
        await ctx.subagents.followup(parent, curatorFiber.childId as any, [{ type: 'text', text: curatorPrompt }], {
          source: { kind: 'user' },
          signal,
        })
      }

      const curatorText = await waitForFiberTurn(ctx, curatorFiber.childId, signal, params.debaterTimeoutMs)
      stoppingState.cumulativeTokens += estimateTokens(curatorText)
      lastCuratorBrief = curatorText

      // Extract gems
      const gemMatches = curatorText.matchAll(/•\s*GEM:\s*([^\n]+)/gi)
      lastGems = []
      for (const gm of gemMatches) {
        lastGems.push(gm[1]!.trim())
      }

      roundsTranscript.push({
        round,
        responses,
        curatorBrief: curatorText,
      })

      // 3. Evaluate Plateau / Stopping
      const decision = evaluateStopping(stoppingState, null, currentIdeaTokens, { consensusThreshold: params.consensusThreshold, plateauDeltaThreshold: params.plateauDeltaThreshold })
      stoppingState.history.push({
        round,
        claims: currentIdeaTokens,
        consensusRatio: 0.5,
      })

      lastStopReason = decision.reason

      if (decision.shouldStop) {
        break
      }
    }

    if (signal.aborted) throw new Error('chorus brainstorm cancelled by user')

    // ── FINAL HARVEST REPORT ──────────────────────────────────────────────
    const allRoundsText = roundsTranscript
      .map(r => `## Round ${r.round}\n` + r.responses.map(d => `### ${d.persona}:\n${d.text}`).join('\n\n'))
      .join('\n\n---\n\n')

    const harvestPrompt = buildCuratorHarvestPrompt(args.query, allRoundsText)

    if (curatorFiber !== null) {
      await ctx.subagents.followup(parent, curatorFiber.childId as any, [{ type: 'text', text: harvestPrompt }], {
        source: { kind: 'user' },
        signal,
      })
      finalHarvest = await waitForFiberTurn(ctx, curatorFiber.childId, signal, params.debaterTimeoutMs)
      stoppingState.cumulativeTokens += estimateTokens(finalHarvest)
    } else {
      finalHarvest = `## Chorus Harvest\n\nBrainstorm completed after ${stoppingState.round} rounds.\n\n${allRoundsText}`
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
    const footer = [
      `\n\n---`,
      `*Chorus Brainstorm completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Why stopped: ${lastStopReason}*`,
    ].join('\n')

    return {
      harvest: finalHarvest + footer,
      roundsRun: stoppingState.round,
      gems: lastGems,
      stopReason: lastStopReason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed,
    }
  } finally {
    const allFibers = [...lensFibers]
    if (curatorFiber !== null) allFibers.push(curatorFiber)
    await disposeCouncilFibers(ctx, allFibers)
  }
}
