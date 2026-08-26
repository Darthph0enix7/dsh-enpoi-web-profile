/**
 * enpoi-council — Tool registrations for `roundtable` and `chorus`.
 *
 * Implements Invariant I7 single-flight mutex per session to reject concurrent
 * council invocations (e.g. LLM emitting [roundtable, roundtable] in one tick).
 *
 * @module dsh-enpoi-council/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { runRoundtable, type RoundtableArgs, type RoundtableResult } from './roundtable'
import { runChorus, type ChorusArgs, type ChorusResult } from './chorus'

export function registerCouncilTools(ctx: Context, root: Context): void {
  ctx = root
  const busyCouncils = new Set<string>()

  // ── ROUNDTABLE TOOL ───────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'roundtable',
    description: [
      'Run a multi-agent dialectic debate (Skeptic, Architect, Pragmatist, Critic) to resolve architectural trade-offs,',
      'stress-test assumptions, and reach battle-tested technical consensus.',
      'Colosseum protocol: Targeted premise interrogation, defend/concede/reframe state machine, and zero-token dynamic silence (CONCUR).',
      'Hardcoded blocking — returns the complete synthesized Council Decision report with consensus trajectory and persistent dissents.',
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
          description: 'Safety round cap (default 5, configurable to 8+ for complex multi-system tasks).',
        },
        hideLimit: {
          type: 'boolean',
          description: 'Hide the round ceiling from debaters to eliminate deadline-pacing bias (default true).',
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
      render: (_args, value) => [{
        type: 'text',
        text: value.synthesis,
      }],
    },
    async execute(args: RoundtableArgs, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('roundtable requires a calling agent')

      const key = parent.session.id
      // Invariant I7: Single-flight tool entry mutex
      if (busyCouncils.has(key)) {
        return {
          synthesis: '## Council Decision\n\nDebate rejected by single-flight mutex (I7): another Council deliberation is already running.',
          roundsRun: 0,
          consensusRatio: 0,
          stopReason: 'CONCURRENT_CALL_REJECTED',
          dissents: [],
        }
      }

      busyCouncils.add(key)
      try {
        const result: RoundtableResult = await runRoundtable(ctx, parent, args, exec.signal)
        return {
          synthesis: result.synthesis,
          roundsRun: result.roundsRun,
          consensusRatio: result.consensusRatio,
          stopReason: result.stopReason,
          dissents: result.dissents,
        }
      } finally {
        busyCouncils.delete(key)
      }
    },
  })

  // ── CHORUS TOOL ───────────────────────────────────────────────────────────
  ctx.tools.register({
    name: 'chorus',
    description: [
      'Run a multi-agent constructive brainstorm (Visionary, Experiencer, Integrator, Curator) to expand vague ideas',
      'into concrete feature options, user moments, and buildable-now roadmaps.',
      'Polyphonic ideation: Ideas build on ideas with effort tags (now/soon/later) and gem spotlighting.',
      'Hardcoded blocking — returns the complete Idea Harvest report with themes, gems, and buildable roadmaps.',
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
          description: 'Safety round cap (default 4).',
        },
        hideLimit: {
          type: 'boolean',
          description: 'Hide the round ceiling from models (default true).',
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
      render: (_args, value) => [{
        type: 'text',
        text: value.harvest,
      }],
    },
    async execute(args: ChorusArgs, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('chorus requires a calling agent')

      const key = parent.session.id
      // Invariant I7: Single-flight tool entry mutex
      if (busyCouncils.has(key)) {
        return {
          harvest: '## Chorus Harvest\n\nBrainstorm rejected by single-flight mutex (I7): another Council deliberation is already running.',
          roundsRun: 0,
          gems: [],
          stopReason: 'CONCURRENT_CALL_REJECTED',
        }
      }

      busyCouncils.add(key)
      try {
        const result: ChorusResult = await runChorus(ctx, parent, args, exec.signal)
        return {
          harvest: result.harvest,
          roundsRun: result.roundsRun,
          gems: result.gems,
          stopReason: result.stopReason,
        }
      } finally {
        busyCouncils.delete(key)
      }
    },
  })
}
