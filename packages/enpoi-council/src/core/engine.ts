/**
 * Council Engine — the task-agnostic epoch loop (doc 54 §3).
 *
 *   preflight? → blind epoch 0 → epochs [ context assembly → parallel seats →
 *   evidence extraction → broker flush → referee pass → engine diff →
 *   stopping ] → chair synthesis.
 *
 * Everything the profiles vary lives in the CouncilSpec; everything the five
 * invariants demand lives here. Blocking by contract; cancellation via the
 * caller's AbortSignal (park semantics handled by the cascade plugin).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  COUNCIL_DENIED_TOOLS,
  DEBATER_DENIED_TOOLS,
  councilDiag,
  disposeSeatFibers,
  ensureBriefWithin,
  estimateTokens,
  followupSeatFiber,
  getLivingBriefText,
  startSeatFiber,
  waitForSeatTurn,
  type SeatFiber,
  type SeatTurn,
} from './fiber.ts'
import { EvidenceQueue, extractEvidenceRequests, serviceEvidenceQueue } from './broker.ts'
import { Ledger } from './ledger.ts'
import { afterChallenge, evaluate, initialRuntime, trackFlipRun, type StoppingRuntime } from './stopping.ts'
import { extractProposals, runRefereePass } from './referee.ts'
import type { CouncilParams } from './spec.ts'
import type { CouncilSpec } from './spec.ts'
import { EvidenceVault } from './vault.ts'

export interface CouncilRuntimeResult {
  deliverable: string
  roundsRun: number
  stopReason: string
  ledgerState: ReturnType<Ledger['state']>
  vaultAdditions: number
  quality: {
    cruxResolutionRatio: number | null
    adversarialSurvivability: number | null
    invariantDensity: number
    newClusters: number | null
  }
  totalTokens: number
  audit: string[]
}

export interface RunCouncilOptions {
  spec: CouncilSpec
  query: string
  params: CouncilParams
  signal: AbortSignal
  /** Round-cap override from the tool call (safety net only). */
  maxRoundsOverride?: number
  onRound?: (info: { epoch: number; audit: Record<string, unknown> }) => void
}

const MAX_SEAT_OUTPUT_CHARS = 6000

export async function runCouncil(
  ctx: Context,
  parent: Agent,
  opts: RunCouncilOptions,
): Promise<CouncilRuntimeResult> {
  const { spec, query, params, signal } = opts
  const maxRounds = opts.maxRoundsOverride !== undefined
    ? Math.min(12, Math.max(1, opts.maxRoundsOverride))
    : params.defaultMaxRounds
  const effectiveParams: CouncilParams = { ...params, defaultMaxRounds: maxRounds }

  const audit: string[] = []
  const ledger = new Ledger()
  const vault = new EvidenceVault()
  const queue = new EvidenceQueue()
  const runtime: StoppingRuntime = initialRuntime()
  const fibers = new Map<string, SeatFiber>()
  /** Per-seat last participation epoch — drives cumulative vault catch-up (amendment #4). */
  const lastActive = new Map<string, number>()
  let totalTokens = 0
  let directives: Record<string, string> = {}
  let floor = { active: spec.seats.map(s => s.id), standby: [] as string[] }
  let briefStall = ''

  const emitRound = (epoch: number, extra: Record<string, unknown>) => {
    try {
      opts.onRound?.({ epoch, audit: extra })
      parent.session.append('council/round', {
        epoch,
        council: spec.id,
        ledgerDiff: {
          entries: ledger.state().entries.map(e => ({ id: e.id, kind: e.kind, status: e.status, author: e.author })),
          edges: ledger.state().edges.length,
        },
        floor,
        vault: vault.since(epoch).length,
        ...extra,
      })
    } catch (err) {
      councilDiag(`council/round append failed: ${String(err)}`)
    }
  }

  try {
    // Observability: started/finished bracket the run (free-form payloads).
    try {
      parent.session.append('council/started', { council: spec.id, query: query.slice(0, 160), seats: spec.seats.map(s => s.id), blindEpoch: spec.opening === 'blind' })
    } catch (err) { councilDiag(`council/started append failed: ${String(err)}`) }

    // ── Shared grounding ────────────────────────────────────────────────
    await ensureBriefWithin(parent, signal)
    const briefText = getLivingBriefText(ctx, parent)

    // ── Optional preflight: INVENTORY ONLY (never interpretation) ───────
    if (params.evidenceBroker && spec.preflightInventory) {
      try {
        const res = await serviceEvidenceQueue(
          ctx, parent,
          [{ ticket: 'EV-preflight', seatId: 'preflight', target: 'this repository', question: `Map the top-level modules, key entry points, and existing docs relevant to: ${query}` }],
          vault, 0, signal, params.evidenceTimeoutMs,
        )
        audit.push(`preflight inventory: ${res.sheets} sheet(s)`)
      } catch (err) {
        councilDiag(`preflight failed (non-fatal): ${String(err)}`)
      }
    }

    // ── Opening: blind epoch 0 (independent formulation) or straight in ──
    // After blind formulation, a REFEREE ADMISSION PASS seeds the ledger
    // (procedural admission of PROPOSE_* blocks) before any deliberation
    // epoch — the "Dispute Ledger Ingest" step. Seats never argue over an
    // empty ledger.
    const openingPrompt = (seatPersonaGate: string) => [
      seatPersonaGate,
      `COUNCIL: ${spec.label}`,
      `QUERY: ${query}`,
      briefText ? `LIVING BRIEF (session context):\n${briefText}` : '',
      spec.scopeContract ? `SCOPE CONTRACT (violations are ruled out of order):\n${spec.scopeContract}` : '',
      spec.opening === 'blind'
        ? 'BLIND FORMULATION: You are formulating INDEPENDENTLY — you cannot see the other seats. State your position in your own voice.'
        : '',
      spec.forestMode
        ? 'Propose ideas as SPROUT: <title> | <rationale> lines (one per idea).'
        : (spec.ledgerKinds.some(k => k.kind === 'crux') ? 'Where you identify a decisive point of disagreement, add a PROPOSE_CRUX: <assertion> line.' : ''),
      'If you need ground truth from the codebase or the web, add NEED_EVIDENCE(target: <area>, question: <what to verify>) lines. Evidence arrives at the next epoch boundary — conclude your arguments conditionally.',
    ].filter(Boolean).join('\n\n')

    {
      councilDiag(`[council ${spec.id}] ${spec.opening} epoch 0: ${spec.seats.length} seats formulating`)
      const blindTurns = await generateParallel(ctx, parent, spec, {
        promptBuilder: seat => openingPrompt(seatPersona(spec, seat)),
        fibers, deny: true, epoch: 0, signal, params,
      })
      totalTokens += blindTurns.tokens
      runtime.tokens = totalTokens
      for (const t of blindTurns.turns) {
        audit.push(`opening: ${t.seatId} ${t.tokens}t`)
        lastActive.set(t.seatId, 0)
      }

      // Evidence requested during formulation is brokered BEFORE the ingest
      // pass (Oracle gate: blind-epoch requests were silently dropped).
      if (params.evidenceBroker) {
        for (const t of blindTurns.turns) queue.push(extractEvidenceRequests(t.seatId, 1, t.text), vault)
        if (queue.size > 0) {
          const served = await serviceEvidenceQueue(ctx, parent, queue.drain(), vault, 1, signal, params.evidenceTimeoutMs)
          audit.push(`opening broker: ${served.sheets} sheet(s)`)
        }
      }

      // Dispute Ledger Ingest: the referee admits opening proposals (epoch 1).
      // Runs for BOTH opening modes — a 'open' spec must never reach the
      // deliberation loop over an empty ledger.
      ledger.setEpoch(1)
      const ingest = await runRefereePass(ctx, parent, {
        spec,
        ledgerText: renderLedger(ledger, spec),
        roundTranscript: blindTurns.turns.map(t => `── ${t.seatId} ──\n${t.text.slice(0, MAX_SEAT_OUTPUT_CHARS)}`).join('\n\n'),
        vaultDeltaText: vault.all().length > 0 ? vault.render() : '',
        epoch: 1,
        previousDirectives: {},
      }, ledger, signal, params.debaterTimeoutMs)
      directives = ingest.output.directives
      floor = ingest.output.floor
      trackFlipRun(runtime, ledger.flipsInEpoch(1) + ingest.applied.admissions.length, false)
      emitRound(1, { flips: ledger.flipsInEpoch(1), admissions: ingest.applied.admissions.length, applied: ingest.applied, phase: 'ingest' })
      audit.push(`ingest: ${ingest.applied.admissions.length} admission(s)`)
    }

    // ── Epoch loop (deliberation epochs start at 2) ─────────────────────
    let epoch = 1
    let stopReason = 'max rounds reached'
    let challengeEpoch = -1
    let consolidationEpoch = -1

    for (epoch = 2; epoch <= effectiveParams.defaultMaxRounds + 2; epoch++) {
      if (signal.aborted) throw new Error('council deliberation aborted')

      const isChallenge = challengeEpoch === epoch

      // 1. Context assembly + parallel seat generation (floor-gated).
      const ledgerText = renderLedger(ledger, spec)
      const round = await generateParallel(ctx, parent, spec, {
        // Cumulative epistemic package per seat (amendment #4): a standby
        // re-entrant receives EVERY vault fact added since it was last active.
        promptBuilder: (seat) => {
          const seatVault = vault.since(lastActive.get(seat.id) ?? 0)
          return [
          seatPersona(spec, seat),
          `EPOCH ${epoch}${isChallenge ? ' — FINAL CHALLENGE' : ''}`,
          `QUERY: ${query}`,
          briefText ? `LIVING BRIEF:\n${briefText}` : '',
          spec.scopeContract ? `SCOPE CONTRACT:\n${spec.scopeContract}` : '',
          `DISPUTE LEDGER:\n${ledgerText}`,
          seatVault.length > 0 ? `EVIDENCE (new since you last sat):\n${vault.render(seatVault)}` : '',
          directives[seat.id] ? `REFEREE DIRECTIVE TO YOU:\n${directives[seat.id]}` : '',
          isChallenge
            ? 'The deliberation has stabilized. State your strongest UNADDRESSED fatal flaw — with evidence — or emit CONCUR [entry-id] WITH <seat> to concede. Nothing else.'
            : buildEpochInstructions(spec),
          'NEED_EVIDENCE(target: <area>, question: <what to verify>) lines request facts for the next epoch boundary.',
        ].filter(Boolean).join('\n\n')
        },
        fibers,
        deny: false,
        epoch,
        signal,
        params,
        only: floor.active,
      })
      for (const t of round.turns) {
        if (t.error === undefined) lastActive.set(t.seatId, epoch)
      }
      totalTokens += round.tokens
      runtime.tokens = totalTokens

      // 2. Evidence extraction + broker flush (BEFORE the referee — amendment #3).
      if (params.evidenceBroker) {
        for (const turn of round.turns) {
          queue.push(extractEvidenceRequests(turn.seatId, epoch, turn.text), vault)
        }
        if (queue.size > 0) {
          const served = await serviceEvidenceQueue(ctx, parent, queue.drain(), vault, epoch, signal, params.evidenceTimeoutMs)
          audit.push(`epoch ${epoch}: broker served ${served.sheets} sheet(s)${served.errors.length > 0 ? ` (${served.errors.length} errors)` : ''}`)
          if (served.errors.length > 0 && briefStall === '') briefStall = served.errors[0]
        }
      }

      // 3. Referee pass (admission + flips + directives + next floor).
      ledger.setEpoch(epoch)
      const transcript = round.turns
        .map(t => `── ${t.seatId} ──\n${t.text.slice(0, MAX_SEAT_OUTPUT_CHARS)}`)
        .join('\n\n')
      const referee = await runRefereePass(ctx, parent, {
        spec,
        ledgerText: renderLedger(ledger, spec),
        roundTranscript: transcript,
        vaultDeltaText: (() => { const ev = vault.since(epoch); return ev.length > 0 ? vault.render(ev) : '' })(),
        epoch,
        previousDirectives: directives,
      }, ledger, signal, params.debaterTimeoutMs)
      directives = referee.output.directives
      floor = referee.output.floor

      // 4. Engine diff — materiality is ENGINE-computed (referee cannot lie).
      // Debate materiality = status flips; ideation materiality = admissions
      // (new ideas). Both are engine-counted from the ledger.
      const flips = ledger.flipsInEpoch(epoch)
      const admissions = referee.applied.admissions.length
      const material = flips + admissions
      trackFlipRun(runtime, material, isChallenge)

      emitRound(epoch, {
        flips,
        admissions,
        zeroFlipRun: runtime.zeroFlipRun,
        applied: referee.applied,
        scopeWarnings: referee.output.scopeWarnings,
        tokens: round.tokens,
      })

      // 5. Stopping.
      if (epoch === consolidationEpoch) {
        stopReason = 'post-challenge consolidation complete'
        break
      }
      if (isChallenge) {
        const v = afterChallenge(material, runtime)
        if (v.action === 'terminate') {
          stopReason = v.reason
          break
        }
        // Exactly ONE consolidation epoch, then unconditional termination.
        // Skip evaluate() here: the stagnation counter is still ≥ the limit
        // (a challenge never resets it) and would kill the consolidation.
        consolidationEpoch = epoch + 1
        stopReason = 'post-challenge consolidation pending'
        continue
      }
      const verdict = evaluate(ledger.state(), runtime, effectiveParams, terminalSet(spec))
      if (verdict.action === 'terminate') {
        stopReason = verdict.reason
        break
      }
      if (verdict.action === 'final-challenge') {
        challengeEpoch = epoch + 1
        audit.push(`epoch ${epoch}: stagnation → final challenge at epoch ${epoch + 1}`)
      }
    }

    // ── Chair synthesis ─────────────────────────────────────────────────
    const deliverable = await runChair(ctx, parent, spec, {
      query, ledger, vault, transcriptNote: briefStall, signal, timeoutMs: params.debaterTimeoutMs,
    })
    totalTokens += deliverable.tokens

    const quality = computeQuality(ledger, spec)
    try {
      parent.session.append('council/finished', { council: spec.id, stopReason, roundsRun: epoch, quality })
    } catch (err) { councilDiag(`council/finished append failed: ${String(err)}`) }

    return {
      deliverable: deliverable.text,
      roundsRun: epoch,
      stopReason,
      ledgerState: ledger.state(),
      vaultAdditions: vault.all().length,
      quality,
      totalTokens,
      audit,
    }
  } finally {
    // Fibers park (cascade interrupt handles user stops); explicit dispose is
    // best-effort for clean runs.
    try { await disposeSeatFibers(ctx, [...fibers.values()]) } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function seatPersona(spec: CouncilSpec, seatId: string): string {
  const seat = spec.seats.find(s => s.id === seatId)
  return seat?.persona ?? `You are the ${seatId} seat of the ${spec.label} council.`
}

function terminalSet(spec: CouncilSpec): Set<string> {
  return new Set(spec.ledgerKinds.flatMap(k => k.terminalStatuses))
}

function buildEpochInstructions(spec: CouncilSpec): string {
  if (spec.forestMode) {
    return [
      'Extend the idea forest: SPROUT new directions, BRANCH variants, FUSE existing ideas, mark TENSION where reality bites an idea.',
      'Nothing is ever deleted; divergence is the goal. One idea per line: SPROUT: <title> | <rationale>.',
    ].join(' ')
  }
  return [
    `Argue your assigned crux. Allowed actions: ${spec.actions.join(', ')}.`,
    spec.steelman
      ? 'MANDATORY STEELMAN: before attacking an opponent\'s position, include `STEELMAN [<seat>]:` reconstructing it at its strongest and naming the boundary where it is correct. Attacks without steelman are ruled invalid.'
      : '',
    'Reference ledger entries by id. Propose new decisive points with PROPOSE_CRUX: <assertion>.',
  ].filter(Boolean).join(' ')
}

function renderLedger(ledger: Ledger, spec: CouncilSpec): string {
  const s = ledger.state()
  if (s.entries.length === 0 && s.edges.length === 0) return '(empty — no entries admitted yet)'
  const terminal = new Set(spec.ledgerKinds.flatMap(k => k.terminalStatuses))
  const lines = s.entries.map(e => {
    const mark = terminal.has(e.status) ? '✔' : '○'
    const ev = e.evidenceRef ? ` [${e.evidenceRef}]` : ''
    return `${mark} ${e.id} (${e.kind}, ${e.status}${e.birthEpoch === s.epoch ? ', NEW' : ''})${ev}: ${e.assertion}`
  })
  const edgeLines = s.edges.map(e => `${e.op} ${e.from ?? '∅'} → ${e.to} (epoch ${e.epoch}, ${e.seat})`)
  return [...lines, ...edgeLines].join('\n')
}

interface GenerateArgs {
  promptBuilder: (seatId: string) => string
  fibers: Map<string, SeatFiber>
  deny: boolean
  epoch: number
  signal: AbortSignal
  params: CouncilParams
  only?: string[]
}

/** Parallel seat generation over the current floor (spawn epoch 0+1, followup after). */
async function generateParallel(
  ctx: Context,
  parent: Agent,
  spec: CouncilSpec,
  args: GenerateArgs,
): Promise<{ turns: SeatTurn[]; tokens: number }> {
  const seats = (args.only ?? spec.seats.map(s => s.id))
    .map(id => spec.seats.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)

  const tasks = seats.map(async (seat): Promise<SeatTurn> => {
    const prompt = args.promptBuilder(seat.id)
    const existing = args.fibers.get(seat.id)
    let fiber: SeatFiber
    let attempt = 0
    let lastError: Error | null = null
    const maxAttempts = 1 + Math.min(2, 1)   // 1 retry
    while (attempt < maxAttempts) {
      attempt++
      try {
        // A known-offline fiber is replaced immediately (Oracle gate #3):
        // following up on a dead child burns a 30s activation-lock wait.
        if (existing !== undefined && existing.isOffline && args.fibers.get(seat.id) === existing) {
          args.fibers.delete(seat.id)
        }
        const current = args.fibers.get(seat.id)
        if (current === undefined || attempt > 1) {
          // fresh fiber (first turn, or retry after a dead fiber)
          fiber = await startSeatFiber(ctx, parent, {
            seatId: seat.id,
            label: `${spec.id} seat: ${seat.id}`,
            persona: seat.persona,
            initialPrompt: prompt,
            denyTools: DEBATER_DENIED_TOOLS,
          }, args.signal)
          args.fibers.set(seat.id, fiber)
        } else {
          fiber = current
          await followupSeatFiber(ctx, parent, fiber, prompt, args.signal)
        }
        const text = await waitForSeatTurn(ctx, fiber.childId, args.signal, args.params.debaterTimeoutMs)
        const tokens = estimateTokens(text)
        fiber.totalTokens += tokens
        return { seatId: seat.id, text, tokens }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        councilDiag(`[epoch ${args.epoch}] seat ${seat.id} attempt ${attempt} failed: ${lastError.message}`)
        if (args.signal.aborted) throw lastError
        if (attempt >= maxAttempts) break
        await new Promise(r => setTimeout(r, 500))
      }
    }
    const fiberState = args.fibers.get(seat.id)
    if (fiberState !== undefined) fiberState.isOffline = true
    return {
      seatId: seat.id,
      text: `[SEAT ERROR: ${seat.id} failed: ${lastError?.message ?? 'deliberation failed'}]`,
      tokens: 0,
      error: lastError?.message ?? 'deliberation failed',
    }
  })

  const settled = await Promise.allSettled(tasks)
  const turns: SeatTurn[] = []
  let tokens = 0
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      turns.push(r.value)
      tokens += r.value.tokens
    } else {
      turns.push({ seatId: 'unknown', text: `[SEAT ERROR: ${String(r.reason)}]`, tokens: 0, error: String(r.reason) })
    }
  }

  // Quorum (doc 38): < quorumFraction responding → fail loud with per-seat detail.
  const online = turns.filter(t => t.error === undefined).length
  // Quorum (Oracle gate #4): zero responders ALWAYS fails; the fraction is
  // computed against the actual floor size (no >=3 bypass — a 2-seat floor
  // still enforces quorum).
  if (seats.length === 0 || online === 0 || online / seats.length < params2Quorum(args.params)) {
    const details = turns.filter(t => t.error !== undefined).map(t => `${t.seatId}: ${t.error}`).join('; ')
    throw new Error(`Council failed quorum: only ${online}/${seats.length} seats responded (required ${(args.params.quorumFraction * 100).toFixed(0)}%). Errors: ${details}`)
  }
  return { turns, tokens }
}

function params2Quorum(p: CouncilParams): number {
  return p.quorumFraction
}

async function runChair(
  ctx: Context,
  parent: Agent,
  spec: CouncilSpec,
  input: { query: string; ledger: Ledger; vault: EvidenceVault; transcriptNote: string; signal: AbortSignal; timeoutMs: number },
): Promise<{ text: string; tokens: number }> {
  const sections = spec.deliverableSections.join(', ')
  const prompt = [
    `COUNCIL: ${spec.label}`,
    `QUERY: ${input.query}`,
    `FINAL LEDGER:\n${renderLedger(input.ledger, spec)}`,
    `EVIDENCE VAULT:\n${input.vault.render()}`,
    input.transcriptNote ? `NOTE: some evidence requests failed (${input.transcriptNote}) — reflect uncertainty where it matters.` : '',
    `Compile the final ${spec.label} deliverable with EXACTLY these sections: ${sections}.`,
    'Zero data loss: every ledger entry and its disposition must be reflected. Falsified paths appear with their refutations. Dissents are preserved verbatim in spirit.',
    'Output the deliverable document only — no meta commentary.',
  ].filter(Boolean).join('\n\n')

  let fiber: { childId: string } | undefined
  try {
    fiber = await startSeatFiber(ctx, parent, {
      seatId: 'chair',
      label: `council chair: ${spec.id}`,
      persona: `You are the Chair of the ${spec.label} council. You compile the final deliverable from the dispute ledger with zero data loss. You write only the deliverable document. Do not call any tools.`,
      initialPrompt: prompt,
      denyTools: DEBATER_DENIED_TOOLS,
    }, input.signal)
    const text = await waitForSeatTurn(ctx, fiber.childId, input.signal, input.timeoutMs)
    return { text, tokens: estimateTokens(text) }
  } finally {
    if (fiber !== undefined) {
      try { await disposeSeatFibers(ctx, [fiber]) } catch { /* best effort */ }
    }
  }
}

function computeQuality(ledger: Ledger, spec: CouncilSpec): CouncilRuntimeResult['quality'] {
  const s = ledger.state()
  const terminal = new Set(spec.ledgerKinds.flatMap(k => k.terminalStatuses))
  const cruxLike = s.entries
  const resolved = cruxLike.filter(e => terminal.has(e.status)).length
  const invariants = cruxLike.filter(e => e.status === 'invariant' && e.evidenceRef !== null).length
  const contested = cruxLike.filter(e => e.status === 'contested')
  const flippedFromOpen = cruxLike.filter(e => e.history.some(h => h.from === 'open' && h.to === 'contested')).length
  return {
    cruxResolutionRatio: cruxLike.length > 0 ? resolved / cruxLike.length : null,
    adversarialSurvivability: cruxLike.length > 0 ? flippedFromOpen / cruxLike.length : null,
    invariantDensity: invariants,
    newClusters: spec.forestMode ? s.edges.filter(e => e.op === 'SPROUT').length : (contested.length >= 0 ? null : null),
  }
}
