import { describe, expect, it, vi } from 'vitest'
import { deliverSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'

import { runCouncil } from '../src/core/engine.ts'
import { ROUNDTABLE_SPEC } from '../src/profiles/roundtable.ts'
import { CHORUS_SPEC } from '../src/profiles/chorus.ts'
import type { CouncilParams } from '../src/core/spec.ts'

/**
 * Council engine integration tests — the REAL engine loop runs against a
 * scripted ctx: fake subagents spawn unique children per call, and the fake
 * persistence serves a scripted sequence of turn texts (blind positions →
 * referee JSON → arguments → fact sheets → challenge → chair deliverable).
 * No real LLM calls; the full doc-54 mechanics are exercised.
 */

const BASE_PARAMS: CouncilParams = {
  defaultMaxRounds: 6,
  stagnationLimit: 2,
  challengeRound: true,
  maxDebateTokens: 200000,
  debaterTimeoutMs: 5000,
  quorumFraction: 2 / 3,
  evidenceBroker: true,
  evidenceTimeoutMs: 5000,
  blindEpoch: true,
  preflightInventory: false,
}

/**
 * Build a scripted ctx. `script` is a list of turn texts consumed in order —
 * one entry per waitForSeatTurn read (seats, referees, brokers, chair).
 */
function makeCtx(script: string[], opts: { failSeats?: boolean } = {}) {
  let spawnSeq = 0
  let readSeq = 0
  const appends: Array<{ type: string; data: unknown }> = []
  const spawnedLabels: string[] = []

  const nextText = (): string => {
    const t = script[readSeq] ?? 'generic scripted turn'
    readSeq += 1
    return t
  }

  const ctx = {
    get: (ns: string) => {
      if (ns === 'settings') return { get: () => ({ personas: {} }) }
      if (ns === 'sessionProjections') return { snapshot: () => ({ values: {} }) }
      if (ns === 'agents') return { get: () => undefined } // children always parked
      if (ns === 'sessionPersistence') {
        return {
          open: async () => ({
            read: async () => {
              const text = opts.failSeats === true
                ? 'irrelevant'
                : nextText()
              const events = opts.failSeats === true
                ? [
                    { type: 'turn/end', seq: 2, data: { reason: { kind: 'error', error: { message: 'provider exploded' } } } },
                  ]
                : [
                    { type: 'assistant/message', seq: 1, data: { message: { content: [{ type: 'text', text }] } } },
                    { type: 'turn/end', seq: 2, data: { reason: { kind: 'completed' } } },
                  ]
              return { events }
            },
            close: async () => undefined,
          }),
        }
      }
      if (ns === 'sessions') return { get: () => ({ append: vi.fn() }), delete: async () => undefined }
      return undefined
    },
    tools: { get: () => undefined },
    agents: { get: () => undefined },
    subagents: {
      startContinuable: async (spec: { label: string }) => {
        spawnSeq += 1
        spawnedLabels.push(spec.label)
        return { childId: `child-${String(spawnSeq).padStart(4, '0')}-aaaa-bbbb-cccc-dddddddddddd` }
      },
      [deliverSubagentPrompt]: async () => undefined,
    },
    logger: { warn: vi.fn(), info: vi.fn() },
  }
  const parent = {
    session: {
      id: 'parent-session',
      seq: 10,
      append: (type: string, data: unknown) => { appends.push({ type, data }) },
    },
    options: { provider: 'p', model: 'm' },
  }
  return { ctx, parent, appends, spawnedLabels, reads: () => readSeq }
}

// ── Script helpers ──────────────────────────────────────────────────────────

const BLIND = 'PROPOSE_CRUX: SQLite write locks will serialize session writes under our concurrency.\nI take the position that durability matters more than latency here.'
const ARGUE = 'I maintain my position on C-1; the write volumes in this deployment are moderate (see the load docs). STEELMAN [skeptic]: The Skeptic is right that lock contention exists at extreme concurrency — that boundary just does not apply at our scale.'
const NEED = 'I accept the framing so far, but I need the real write pattern before conceding.\nNEED_EVIDENCE(target: queue scheduler, question: does claim_next use a database lock or a transactional row update?)'
const CONCUR = 'CONCUR [C-2] WITH skeptic: the operational-surface argument is sound and I withdraw my preference.'
const SHEET = 'CITATION: src/core/queue.py:142\nFACTS: claim_next acquires a transactional row update with a 5s lease; no separate lock file.\nCONFIDENCE: high'
const CHAIR = '# Decision\n\nAdopt the transactional lease design (C-1 invariant). C-2 dissolved by operational analysis.\n\n## Established Invariants\n- Lease-based claims with bounded staleness.\n\n## Binding Dissents\nNone.'

function refereeJson(o: { admissions?: Array<{ kind: string; assertion: string; author: string }>; flips?: Array<{ id: string; to: string; reason: string }>; floor?: { active: string[]; standby: string[] }; directives?: Record<string, string> }): string {
  return JSON.stringify({
    admissions: o.admissions ?? [],
    flips: o.flips ?? [],
    directives: o.directives ?? { skeptic: '1. Press the failure-mode claim.', architect: '1. Quantify the latency cost.', pragmatist: '1. Scope the operational burden.' },
    floor: o.floor ?? { active: ['skeptic', 'architect', 'pragmatist'], standby: [] },
    scopeWarnings: [],
  })
}

// ── The full debate run ─────────────────────────────────────────────────────

describe('council engine — scripted full runs', () => {
  it('runs a full debate: blind → admissions → flip → stagnation → challenge → terminate → chair', async () => {
    // Read order: 3 blind seats, referee#1, 3 seats, referee#2 (flip), 2 seats (standby), referee#3,
    // 2 seats, referee#4 (stagnation reached) → challenge: 3 seats, referee#5 (silent) → terminate → chair.
    const script = [
      BLIND, BLIND, BLIND,                                   // blind epoch 0
      refereeJson({ admissions: [
        { kind: 'crux', assertion: 'SQLite write locks will serialize session writes under our concurrency.', author: 'skeptic' },
        { kind: 'crux', assertion: 'Redis adds operational surface we cannot operate at this scale.', author: 'pragmatist' },
      ] }),                                                  // referee epoch 1
      ARGUE, NEED, ARGUE,                                    // epoch 1 seats (one evidence request)
      SHEET,                                                 // broker
      refereeJson({ flips: [{ id: 'C-1', to: 'contested', reason: 'genuine dispute; evidence pending' }], floor: { active: ['skeptic', 'architect'], standby: ['pragmatist'] } }),
      ARGUE, ARGUE,                                          // epoch 2 (2 seats — pragmatist standby)
      refereeJson({}),                                       // referee epoch 3 (no flips; floor resets to all)
      ARGUE, ARGUE, ARGUE,                                   // epoch 4 (3 seats — floor was reset)
      refereeJson({}),                                       // referee epoch 4 (no flips → run=2 → challenge)
      CONCUR, CONCUR, CONCUR,                                // epoch 5: FINAL CHALLENGE (3 seats)
      refereeJson({}),                                       // referee challenge (silent → terminate)
      CHAIR,                                                 // chair
    ]
    const { ctx, parent, appends } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: ROUNDTABLE_SPEC,
      query: 'Session-state storage: SQLite vs Redis',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })

    expect(result.deliverable).toContain('Decision')
    expect(result.stopReason).toBe('final challenge produced no state changes')
    expect(result.roundsRun).toBeGreaterThanOrEqual(4)
    expect(result.ledgerState.entries.length).toBe(2)
    expect(result.ledgerState.entries[0].status).toBe('contested')   // C-1 flipped once
    expect(result.vaultAdditions).toBe(1)

    // Quality proxies from the ledger. This script ends via the challenge
    // (not convergence), so nothing reached a terminal status: ratio 0.
    expect(result.quality.cruxResolutionRatio).toBe(0)
    expect(result.quality.invariantDensity).toBe(0)

    // council/round events carried the ledger + floor payload (doc 54 §13 #5).
    const rounds = appends.filter(a => a.type === 'council/round')
    expect(rounds.length).toBeGreaterThanOrEqual(4)
    const withFlip = rounds.find(r => (r.data as { flips?: number }).flips === 1)
    expect(withFlip).toBeDefined()
    expect((withFlip!.data as { ledgerDiff?: unknown }).ledgerDiff).toBeDefined()
    expect((withFlip!.data as { floor?: unknown }).floor).toBeDefined()
  })

  it('broker fact sheets land in the vault and dedupe (one dispatch per unique question)', async () => {
    const script = [
      BLIND, BLIND, BLIND,
      refereeJson({ admissions: [{ kind: 'crux', assertion: 'C-1 style claim about locks', author: 'skeptic' }] }),
      NEED, NEED, ARGUE,           // TWO seats request the SAME fact → one dispatch
      SHEET,                       // broker (single)
      refereeJson({}),
      ARGUE, ARGUE, ARGUE,
      refereeJson({ flips: [{ id: 'C-1', to: 'contested', reason: 'open dispute' }] }),
      ARGUE, ARGUE, ARGUE,
      refereeJson({}),
      ARGUE, ARGUE, ARGUE,
      refereeJson({}),
      CONCUR, CONCUR, CONCUR,
      refereeJson({}),
      CHAIR,
    ]
    const { ctx, parent, spawnedLabels } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: ROUNDTABLE_SPEC,
      query: 'Session-state storage',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })
    expect(result.vaultAdditions).toBe(1)
    const brokerSpawns = spawnedLabels.filter(l => l.startsWith('council broker:'))
    expect(brokerSpawns).toHaveLength(1)
  })

  it('quorum failure fails loud with per-seat errors', async () => {
    const { ctx, parent } = makeCtx([], { failSeats: true })
    await expect(runCouncil(ctx, parent, {
      spec: ROUNDTABLE_SPEC,
      query: 'anything',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })).rejects.toThrow(/failed quorum/i)
  })

  it('maxRoundsOverride bounds the run as a safety net', async () => {
    // Referee never flips → stagnation would fire, but maxRounds=2 bounds first.
    const script: string[] = []
    script.push(BLIND, BLIND, BLIND)
    script.push(refereeJson({ admissions: [{ kind: 'crux', assertion: 'a claim', author: 'skeptic' }] }))
    for (let i = 0; i < 6; i++) {
      script.push(ARGUE, ARGUE, ARGUE)
      script.push(refereeJson({}))
    }
    script.push(CHAIR)
    const { ctx, parent } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: ROUNDTABLE_SPEC,
      query: 'q',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
      maxRoundsOverride: 2,
    })
    expect(result.roundsRun).toBeLessThanOrEqual(3)
    expect(result.stopReason).toMatch(/max rounds/)
  })

  it('opening-phase evidence requests are brokered BEFORE the ingest referee pass', async () => {
    const blindWithNeed = 'PROPOSE_CRUX: The claim format needs a lease TTL.\nNEED_EVIDENCE(target: queue scheduler, question: does claim_next use a lock or a row update?)'
    const script = [
      BLIND, BLIND, blindWithNeed,                     // blind epoch 0 (one seat requests evidence)
      SHEET,                                           // broker flush BEFORE ingest
      refereeJson({ admissions: [
        { kind: 'crux', assertion: 'The claim format needs a lease TTL.', author: 'skeptic' },
      ], evidenceNote: 'vault has F-1' }),
      ARGUE, ARGUE, ARGUE,                             // epoch 2
      refereeJson({ flips: [{ id: 'C-1', to: 'contested', reason: 'open dispute' }] }),
      ARGUE, ARGUE, ARGUE,                             // epoch 3
      refereeJson({}),                                 // run=1
      ARGUE, ARGUE, ARGUE,                             // epoch 4
      refereeJson({}),                                 // run=2 → challenge
      CONCUR, CONCUR, CONCUR,                          // epoch 5 challenge
      refereeJson({}),                                 // silent → terminate
      CHAIR,
    ]
    const { ctx, parent, spawnedLabels } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: ROUNDTABLE_SPEC,
      query: 'q',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })
    // The broker child spawned BEFORE the ingest referee child (vault commit precedes ingest).
    const brokerIdx = spawnedLabels.findIndex(l => l.startsWith('council broker:'))
    const ingestIdx = spawnedLabels.findIndex(l => l.includes('referee: epoch 1'))
    expect(brokerIdx).toBeGreaterThanOrEqual(0)
    expect(ingestIdx).toBeGreaterThan(brokerIdx)
    expect(result.vaultAdditions).toBe(1)
  })

  it("opening: 'open' runs formulation + ingest and never aborts on an empty ledger", async () => {
    const openSpec = { ...ROUNDTABLE_SPEC, opening: 'open' as const }
    const script = [
      ARGUE + ' PROPOSE_CRUX: Open-mode positions land as ledger entries.',   // epoch-1 formulation (open, 3 seats)
      ARGUE, ARGUE,
      refereeJson({ admissions: [{ kind: 'crux', assertion: 'Open-mode positions land as ledger entries.', author: 'skeptic' }] }),
      ARGUE, ARGUE, ARGUE,                             // epoch 2
      refereeJson({ flips: [{ id: 'C-1', to: 'contested', reason: 'disputed' }] }),
      ARGUE, ARGUE, ARGUE,                             // epoch 3
      refereeJson({}),                                 // run=1
      ARGUE, ARGUE, ARGUE,                             // epoch 4
      refereeJson({}),                                 // run=2 → challenge
      CONCUR, CONCUR, CONCUR,                          // epoch 5 challenge
      refereeJson({}),                                 // silent → terminate
      CHAIR,
    ]
    const { ctx, parent } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: openSpec,
      query: 'q',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })
    expect(result.stopReason).not.toBe('no ledger entries were ever admitted')
    expect(result.ledgerState.entries.length).toBeGreaterThanOrEqual(1)
    expect(result.deliverable).toContain('Decision')
  })

  it('chorus runs in forest mode and terminates on saturation', async () => {
    const sprout = 'SPROUT: Ambient dock | A glanceable strip summarizing fleet state.'
    const script = [
      sprout, sprout, sprout,                                  // blind
      refereeJson({ admissions: [
        { kind: 'idea', assertion: 'Ambient dock', author: 'visionary' },
        { kind: 'idea', assertion: 'Fleet glance strip', author: 'experiencer' },
        { kind: 'idea', assertion: 'Task pulse header', author: 'integrator' },
      ] }),
      sprout, sprout, sprout,                                  // epoch 1 (admissions → material)
      refereeJson({ admissions: [{ kind: 'idea', assertion: 'Follow-up sprout', author: 'visionary' }] }),
      sprout, sprout, sprout,                                  // epoch 2 (admissions → material)
      refereeJson({}),                                         // no admissions → run=1
      sprout, sprout, sprout,                                  // epoch 3
      refereeJson({}),                                         // no admissions → run=2 → challenge
      'SPROUT: One last radical direction | because the challenge asked.', 'SPROUT: wild card | divergence.', 'SPROUT: another angle | divergence.',
      refereeJson({ admissions: [{ kind: 'idea', assertion: 'One last radical direction', author: 'visionary' }] }),
      'SPROUT: consolidation | fusing the harvest threads.', 'SPROUT: c2 | thread.', 'SPROUT: c3 | thread.',
      refereeJson({}),                                         // consolidation referee → terminate unconditionally
      '# Harvest\n\nGems with lineage and clusters.',
    ]
    const { ctx, parent } = makeCtx(script)
    const result = await runCouncil(ctx, parent, {
      spec: CHORUS_SPEC,
      query: 'Reimagine the harness sidebar',
      params: BASE_PARAMS,
      signal: new AbortController().signal,
    })
    expect(result.deliverable).toContain('Harvest')
    expect(result.ledgerState.entries.length).toBeGreaterThanOrEqual(5)
    expect(result.ledgerState.edges.length).toBe(0) // edges come from parsed ops in v2; entries carry the ideas
  })
})
