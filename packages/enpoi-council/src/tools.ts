/**
 * enpoi-council — Tool registrations for `roundtable` and `chorus`.
 *
 * Same names, args, and output contracts as before (compat) — the internals
 * now run the doc-54 core engine. I7 single-flight mutex per session guards
 * both tools.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { runCouncil } from './core/engine.ts'
import type { CouncilRuntimeResult } from './core/engine.ts'
import { CHORUS_SPEC, CHORUS_PARAM_DEFAULTS } from './profiles/chorus.ts'
import { ROUNDTABLE_SPEC, ROUNDTABLE_PARAM_DEFAULTS } from './profiles/roundtable.ts'
import { getCouncilParams } from './params.ts'
import type { CouncilRuntimeParams } from './params.ts'

interface CouncilArgs {
  query: string
  maxRounds?: number
  hideLimit?: boolean
}

function mergeParams(resolved: CouncilRuntimeParams, over: Partial<CouncilParams>): CouncilRuntimeParams {
  return { ...resolved, ...over }
}

function qualityBlock(r: CouncilRuntimeResult): string {
  const q = r.quality
  const lines = [
    `Crux resolution: ${q.cruxResolutionRatio !== null ? `${(q.cruxResolutionRatio * 100).toFixed(0)}%` : 'n/a'}`,
    `Adversarial survivability: ${q.adversarialSurvivability !== null ? `${(q.adversarialSurvivability * 100).toFixed(0)}%` : 'n/a'}`,
    `Evidence-backed invariants: ${q.invariantDensity}`,
  ]
  if (q.newClusters !== null) lines.push(`Distinct idea clusters: ${q.newClusters}`)
  return lines.join(' · ')
}

export function registerCouncilTools(ctx: Context, root: Context): void {
  void root
  const busyCouncils = new Set<string>()

  // ── ROUNDTABLE ────────────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'roundtable',
    description: [
      'Run a high-stakes multi-agent architecture debate (Skeptic, Architect, Pragmatist + Referee + Chair).',
      'Blind independent formulation, steelmanned dialectic over a dispute ledger, referee adjudication with floor allocation,',
      'evidence broker for codebase/web ground truth, deterministic peak-stopping with a final challenge round.',
      'Hardcoded blocking — returns the Council Decision (ADR) with binding dissents and quality metrics.',
      'Pure deliberation: the result is an advisory report — do NOT make speculative code edits or file modifications during or immediately after this call without explicit user confirmation.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The specific architectural dilemma, design choice, or technical decision to debate.',
        },
        maxRounds: {
          type: 'number',
          description: 'Safety round cap (default 6). Never announced to the seats.',
        },
        hideLimit: {
          type: 'boolean',
          description: 'Kept for compatibility; the round cap is always hidden from the seats.',
        },
      },
      required: ['query'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          synthesis: { type: 'string' },
          roundsRun: { type: 'number' },
          consensusRatio: { type: 'number' },
          stopReason: { type: 'string' },
          dissents: { type: 'array', items: { type: 'string' } },
        },
        required: ['synthesis', 'roundsRun', 'consensusRatio', 'stopReason', 'dissents'],
      },
      render: (_args, value) => [{ type: 'text', text: value.synthesis }],
    },
    async execute(args: CouncilArgs, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('roundtable requires a calling agent')
      const key = parent.session.id
      if (busyCouncils.has(key)) {
        return {
          synthesis: '## Council Decision\n\nDebate rejected by single-flight mutex (I7): another Council deliberation is already running.',
          roundsRun: 0, consensusRatio: 0, stopReason: 'CONCURRENT_CALL_REJECTED', dissents: [],
        }
      }
      busyCouncils.add(key)
      try {
        const resolved = mergeParams(getCouncilParams(ctx), ROUNDTABLE_PARAM_DEFAULTS)
        const result = await runCouncil(ctx, parent, {
          spec: ROUNDTABLE_SPEC,
          query: args.query,
          params: resolved,
          signal: exec.signal,
          maxRoundsOverride: args.maxRounds,
        })
        const dissents = result.ledgerState.entries
          .filter(e => e.status === 'dissent')
          .map(e => `${e.id}: ${e.assertion}`)
        const consensusRatio = result.quality.cruxResolutionRatio ?? 0
        const synthesis = [
          result.deliverable,
          '',
          '---',
          `_${result.roundsRun} epoch(s) · stop: ${result.stopReason} · ${qualityBlock(result)}_`,
        ].join('\n')
        return { synthesis, roundsRun: result.roundsRun, consensusRatio, stopReason: result.stopReason, dissents }
      } finally {
        busyCouncils.delete(key)
      }
    },
  })

  // ── CHORUS ────────────────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'chorus',
    description: [
      'Run a polyphonic brainstorm (Visionary, Experiencer, Integrator + Curator).',
      'Ideas grow in an append-only forest — divergence-first, nothing ever pruned — with blind independent formulation,',
      'topological-saturation stopping, and a lineage-tracked harvest.',
      'Hardcoded blocking — returns the Idea Harvest with themes, gems and provenance.',
      'Pure ideation: the result is an advisory report — do NOT make speculative code edits or file modifications during or immediately after this call without explicit user confirmation.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The vision, feature concept, or seed idea to brainstorm.',
        },
        maxRounds: {
          type: 'number',
          description: 'Safety round cap (default 6). Never announced to the seats.',
        },
        hideLimit: {
          type: 'boolean',
          description: 'Kept for compatibility; the round cap is always hidden from the seats.',
        },
      },
      required: ['query'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          harvest: { type: 'string' },
          roundsRun: { type: 'number' },
          gems: { type: 'array', items: { type: 'string' } },
          stopReason: { type: 'string' },
        },
        required: ['harvest', 'roundsRun', 'gems', 'stopReason'],
      },
      render: (_args, value) => [{ type: 'text', text: value.harvest }],
    },
    async execute(args: CouncilArgs, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('chorus requires a calling agent')
      const key = parent.session.id
      if (busyCouncils.has(key)) {
        return {
          harvest: '## Chorus Harvest\n\nBrainstorm rejected by single-flight mutex (I7): another Council deliberation is already running.',
          roundsRun: 0, gems: [], stopReason: 'CONCURRENT_CALL_REJECTED',
        }
      }
      busyCouncils.add(key)
      try {
        const resolved = mergeParams(getCouncilParams(ctx), CHORUS_PARAM_DEFAULTS)
        const result = await runCouncil(ctx, parent, {
          spec: CHORUS_SPEC,
          query: args.query,
          params: resolved,
          signal: exec.signal,
          maxRoundsOverride: args.maxRounds,
        })
        const gems = result.ledgerState.entries.slice(0, 12).map(e => `${e.id}: ${e.assertion}`)
        const harvest = [
          result.deliverable,
          '',
          '---',
          `_${result.roundsRun} epoch(s) · stop: ${result.stopReason} · ${qualityBlock(result)}_`,
        ].join('\n')
        return { harvest, roundsRun: result.roundsRun, gems, stopReason: result.stopReason }
      } finally {
        busyCouncils.delete(key)
      }
    },
  })
}
