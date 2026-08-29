/**
 * enpoi-file-revert — File Revert & Rollback Protection System (Doc 44).
 *
 * Implements the two-seam mutation capture pipeline, content-addressed raw-byte
 * snapshots, the 6-state conflict matrix, idempotent intent-WAL crash recovery,
 * and operator conflict resolution for agent `edit`/`write` tool mutations.
 *
 * Core invariants (Doc 44 §1):
 * - FR1 Zero Silent Clobber: auto-revert only when sha256(disk) === finalPostSha.
 * - FR2 Zero Accidental Deletion: delete only when preExisted === false.
 * - FR3 Exact-Byte Fidelity: raw bytes, never lossy string conversion.
 * - FR4 Clean Workspace: backups live in the blob store, never the working tree.
 * - FR5 Idempotent Crash Recovery: intent/result WAL pair, replay on load.
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { BlobStore } from './blob-store'
import { MutationManifest } from './manifest'
import { evaluateBoundary, STATE } from './evaluator'
import { RevertExecutor } from './executor'
import { capturePre, capturePost, type PendingCapture } from './capture'

export const name = 'enpoi-file-revert'
export const inject = ['tools', 'fs', 'sessions', 'sessionPersistence', 'timer']

const FILE_HISTORY_ROOT = join(homedir(), '.dsh', 'file-history')
const TRASH_ROOT = join(homedir(), '.dsh', 'trash')
const DIAG_LOG = join(homedir(), '.dsh', 'logs', 'enpoi-file-revert.log')

function diag(msg: string): void {
  try {
    mkdirSync(join(homedir(), '.dsh', 'logs'), { recursive: true })
    appendFileSync(DIAG_LOG, `[${new Date().toISOString()}] ${msg}\n`)
  } catch { /* best-effort */ }
}

export const Config = Schema.object({
  /** Maximum snapshot size in bytes; larger files degrade to the unavailable-prompt path. */
  maxSnapshotBytes: Schema.number().default(10 * 1024 * 1024),
  /** Interval for the reachability GC sweep (ms). */
  gcIntervalMs: Schema.number().default(6 * 60 * 60 * 1000),
  /** Age threshold for unreferenced blobs (ms). */
  gcTtlMs: Schema.number().default(30 * 24 * 60 * 60 * 1000),
})

export interface FileRevertConfig {
  maxSnapshotBytes: number
  gcIntervalMs: number
  gcTtlMs: number
}

interface SessionRevertState {
  /** The active revert boundary (fromSeq) for this session, or null when none. */
  boundary: number | null
  /** Initialized flag: true if boundary was folded from session events. */
  initialized: boolean
  /** Chained flight promise: serialized execution queue per session (I7). */
  flight: Promise<void>
}

export function apply(ctx: Context, config: FileRevertConfig): void {
  diag(`apply: mounted (maxSnapshotBytes=${config.maxSnapshotBytes}, gcIntervalMs=${config.gcIntervalMs})`)
  const blobStore = new BlobStore(join(FILE_HISTORY_ROOT, 'blobs'))
  void blobStore.init()
  const pendingCaptures = new Map<string, PendingCapture>()
  const sessionStates = new Map<string, SessionRevertState>()
  const manifests = new Map<string, MutationManifest>()
  const executors = new Map<string, RevertExecutor>()

  function manifestFor(sessionId: string): MutationManifest {
    let m = manifests.get(sessionId)
    if (m === undefined) {
      m = new MutationManifest(join(FILE_HISTORY_ROOT, sessionId, 'manifest.jsonl'))
      void m.init()
      manifests.set(sessionId, m)
    }
    return m
  }

  function executorFor(sessionId: string): RevertExecutor {
    let e = executors.get(sessionId)
    if (e === undefined) {
      e = new RevertExecutor({
        blobStore,
        trashRoot: TRASH_ROOT,
        walFile: join(FILE_HISTORY_ROOT, sessionId, 'wal.jsonl'),
      })
      void e.init()
      executors.set(sessionId, e)
    }
    return e
  }

  function stateFor(session: Session): SessionRevertState {
    let s = sessionStates.get(session.id)
    if (s === undefined) {
      let recoveredBoundary: number | null = null
      if (session.events !== undefined) {
        for (let i = session.events.length - 1; i >= 0; i--) {
          const ev = session.events[i]
          if (ev?.type === 'revert/state') {
            recoveredBoundary = (ev.data as { fromSeq: number | null }).fromSeq
            break
          }
        }
      }
      s = { boundary: recoveredBoundary, initialized: true, flight: Promise.resolve() }
      sessionStates.set(session.id, s)
    }
    return s
  }

  // ── 1. Two-seam mutation capture ──────────────────────────────────────────
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next) => {
    if (exec.name === 'edit' || exec.name === 'write') {
      try {
        await capturePre(ctx, exec, pendingCaptures, config.maxSnapshotBytes)
      } catch (err) {
        diag(`pre-capture failed for ${exec.name}: ${String(err)}`)
      }
    }
    return next()
  })

  ctx.on('tools/post-execute', async (exec: ToolExecution, result: ToolExecutionResult, next) => {
    if (exec.name === 'edit' || exec.name === 'write') {
      try {
        await capturePost(ctx, exec, result, pendingCaptures, manifestFor, blobStore)
      } catch (err) {
        diag(`post-capture failed for ${exec.name}: ${String(err)}`)
      }
    }
    return next()
  })

  // ── 2. Revert trigger: react to revert/state events ───────────────────────
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (event.type !== 'revert/state') return
    const data = event.data as { fromSeq: number | null; cause?: 'revert' | 'restore' | 'commit' }
    const fromSeq = data.fromSeq
    const cause = data.cause ?? (fromSeq === null ? 'restore' : 'revert')
    diag(`revert/state: session=${session.id} fromSeq=${String(fromSeq)} cause=${cause}`)

    const state = stateFor(session)
    const oldBoundary = state.boundary
    const newBoundary = fromSeq
    state.boundary = newBoundary

    if (cause === 'commit') {
      // Revert-commit: clear boundary without running file reversions
      // (the new prompt commits from the reverted state; files stay as-is).
      diag(`revert/state: commit for ${session.id} — clearing boundary without file execution`)
      return
    }

    // Equal-seq restore (restore to the current boundary) is a no-op — honor
    // the cause instead of misclassifying it as a revert (Oracle B-class).
    if (cause === 'restore' && newBoundary !== null && newBoundary === oldBoundary) {
      diag(`revert/state: equal-seq restore no-op for ${session.id} (boundary=${String(newBoundary)})`)
      return
    }

    // Queue transition on flight chain so rapid clicks execute strictly in order.
    state.flight = state.flight.then(async () => {
      try {
        await executeFileTransition(ctx, session, oldBoundary, newBoundary, manifestFor, executorFor, blobStore)
      } catch (err) {
        diag(`revert execution FAILED for ${session.id}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
        try {
          appendIgnorable(session, 'revert/file-result', {
            revertSeq: fromSeq ?? -1,
            outcomes: { _error: { status: 'error', reason: err instanceof Error ? err.message : String(err) } },
          })
        } catch { /* session may be gone */ }
      }
    })
  })

  // ── 3. Operator conflict resolution bridge (host RPC → waterfall) ─────────
  const onAny = (ctx as unknown as {
    on: (name: string, fn: (...args: unknown[]) => unknown) => () => void
  }).on
  onAny('file-revert/resolve', async (...args: unknown[]) => {
    diag(`file-revert/resolve received: ${JSON.stringify(args[0])}`)
    const request = args[0] as {
      sessionId: string
      conflictId: string
      resolution: 'keep' | 'restore' | 'recreate' | 'trash'
    }
    try {
      const outcome = await applyConflictResolution(ctx, request, executorFor, blobStore, stateFor, manifestFor)
      diag(`file-revert/resolve outcome: ${JSON.stringify(outcome)}`)
      return { accepted: true as const, ...outcome }
    } catch (err) {
      diag(`file-revert/resolve ERROR: ${String(err)}`)
      return { accepted: false as const, reason: String(err) }
    }
  })

  // ── 4. Crash recovery + GC on boot ────────────────────────────────────────
  void recoverUnsealedIntents(ctx, executorFor)

  const timer = ctx.get('timer') as { setInterval?: (fn: () => void, ms: number) => unknown } | undefined
  if (timer?.setInterval !== undefined) {
    timer.setInterval(() => {
      void runGc(manifests, executors, blobStore, config.gcTtlMs).catch((err) => {
        diag(`GC sweep failed: ${String(err)}`)
      })
    }, config.gcIntervalMs)
  }

  onAny('dispose', () => {
    pendingCaptures.clear()
    sessionStates.clear()
  })
}

// ── Revert execution ─────────────────────────────────────────────────────────

/** Append a custom (plugin-merged) session event with the ignorable envelope. */
function appendIgnorable(session: Session, type: string, data: unknown): void {
  // The merged engine dropped the per-event `ignorable` flag: log-only event
  // types (revert/file-*) are registered in the core SessionEventMap, so a
  // plain append is surface-ineligible by type.
  session.append(type as never, data as never)
}

async function executeFileTransition(
  ctx: Context,
  session: Session,
  oldBoundary: number | null,
  newBoundary: number | null,
  manifestFor: (id: string) => MutationManifest,
  executorFor: (id: string) => RevertExecutor,
  _blobStore: BlobStore,
): Promise<void> {
  const manifest = manifestFor(session.id)
  const executor = executorFor(session.id)

  const isRevert = newBoundary !== null && (oldBoundary === null || newBoundary <= oldBoundary)
  const isRestore = (newBoundary === null && oldBoundary !== null) || (newBoundary !== null && oldBoundary !== null && newBoundary > oldBoundary)

  if (!isRevert && !isRestore) {
    diag(`executeFileTransition: no-op transition for ${session.id} (old=${String(oldBoundary)}, new=${String(newBoundary)})`)
    return
  }

  const mode: 'revert' | 'restore' = isRevert ? 'revert' : 'restore'
  // On revert: span starts at newBoundary.
  // On restore: span starts at oldBoundary (the mutations being un-reverted).
  const spanStart = isRevert ? newBoundary! : oldBoundary!
  const aggregated = manifest.aggregateSpan(spanStart)
  diag(`executeFileTransition: session=${session.id} mode=${mode} oldBoundary=${String(oldBoundary)} newBoundary=${String(newBoundary)} spanStart=${spanStart} aggregated=${aggregated.size} records=${manifest.records.length}`)

  if (aggregated.size === 0) return

  // Active-child guard (Doc 44 §3.3): refuse file revert while any child fiber
  // is active or parked-resumable and has touched files in the span.
  const activeChildren = await findActiveChildren(ctx, session.id)
  if (activeChildren.length > 0) {
    appendIgnorable(session, 'revert/file-result', {
      revertSeq: newBoundary ?? -1,
      outcomes: {
        _guard: { status: 'refused', reason: `active subagent fibers: ${activeChildren.join(', ')}` },
      },
    })
    diag(`file revert refused for ${session.id} — active children ${activeChildren.join(', ')}`)
    return
  }

  // Build the plan: target = state at newBoundary (null → finalPost, number → latest mutation ≤ seq).
  const plan = new Map<string, { entry: unknown; state: string; action: string; targetBlobSha: string | null; expectedDiskSha: string | null; reason?: string }>()
  const conflicts: Array<{
    targetKey: string
    displayPath: string
    state: 'conflict' | 'missing' | 'unavailable'
    reason: string
    mode: 'revert' | 'restore'
    boundarySeq: number | null
    spanStartSeq: number
    targetBlobSha: string | null
    targetAbsent: boolean
    spanPreExisted: boolean
    sessionCreated: boolean
    preSha: string | null
    postSha: string | null
    currentSha: string | null
  }> = []

  for (const [targetKey, entry] of aggregated) {
    const target = manifest.resolveRestoreTarget(targetKey, newBoundary)
    const current = await readDiskBytes(ctx, targetKey)
    const currentSha = current === null ? null : sha256Hex(current)
    let evalResult = evaluateBoundary(entry, target, currentSha)
    // Interleaved-chain degrade (Oracle E-class): a mid-span restore inside an
    // interleaved region has an unreliable boundary post-state — surface a
    // conflict card instead of auto-transitioning on a guessed target.
    if (target.isInterleaved && evalResult.action !== 'prompt' && evalResult.action !== 'skip') {
      evalResult = {
        state: STATE.UNAVAILABLE,
        action: 'skip',
        targetBlobSha: evalResult.targetBlobSha,
        expectedDiskSha: currentSha,
        targetAbsent: evalResult.targetAbsent,
        reason: 'interleaved user edits make the boundary state unreliable',
      }
    }
    plan.set(targetKey, {
      entry,
      state: evalResult.state,
      action: evalResult.action,
      targetBlobSha: evalResult.targetBlobSha,
      expectedDiskSha: evalResult.expectedDiskSha,
      reason: evalResult.reason,
    })
    if (evalResult.state === STATE.CONFLICT || evalResult.state === STATE.MISSING || evalResult.state === STATE.UNAVAILABLE) {
      conflicts.push({
        targetKey,
        displayPath: entry.finalPost.displayPath,
        state: evalResult.state as 'conflict' | 'missing' | 'unavailable',
        reason: evalResult.reason ?? '',
        mode,
        boundarySeq: newBoundary,
        spanStartSeq: spanStart,
        targetBlobSha: evalResult.targetBlobSha,
        targetAbsent: evalResult.targetAbsent ?? (target.postBlobSha === null && target.preBlobSha === null),
        spanPreExisted: target.preExisted,
        sessionCreated: entry.sessionCreated ?? !entry.initialPre.preExisted,
        preSha: entry.initialPre.preBlobSha,
        postSha: entry.finalPost.postBlobSha,
        currentSha,
      })
    }
  }

  // Append intent WAL event BEFORE any disk mutation.
  appendIgnorable(session, 'revert/file-intent', {
    revertSeq: newBoundary ?? -1,
    plan: Object.fromEntries([...plan].map(([key, p]) => [key, { action: p.action, targetBlobSha: p.targetBlobSha, expectedDiskSha: p.expectedDiskSha }])),
  })

  // Execute clean auto-reverts.
  const typedPlan = plan as Map<string, { action: string; targetBlobSha: string | null; expectedDiskSha: string | null }>
  const { outcomes } = await executor.execute({
    sessionId: session.id,
    revertSeq: newBoundary ?? -1,
    plan: typedPlan,
    resolvePath: async (key: string) => key,
    readDisk: async (key: string) => readDiskBytes(ctx, key),
    writeDisk: async (path: string, bytes: Buffer) => executor.atomicWrite(path, bytes),
    trashFile: async (path: string) => executor.trash(path, session.id),
  })

  // Surface conflicts as durable events for the client modal.
  for (const c of conflicts) {
    appendIgnorable(session, 'revert/file-conflict', {
      conflictId: randomUUID(),
      targetKey: c.targetKey,
      displayPath: c.displayPath,
      state: c.state,
      reason: c.reason,
      mode: c.mode,
      boundarySeq: c.boundarySeq,
      spanStartSeq: c.spanStartSeq,
      targetBlobSha: c.targetBlobSha,
      targetAbsent: c.targetAbsent,
      spanPreExisted: c.spanPreExisted,
      sessionCreated: c.sessionCreated,
      preSha: c.preSha,
      postSha: c.postSha,
      currentSha: c.currentSha,
    })
  }

  // Seal with the terminal marker.
  appendIgnorable(session, 'revert/file-result', { revertSeq: newBoundary ?? -1, outcomes })
}

// ── Conflict resolution ──────────────────────────────────────────────────────

async function applyConflictResolution(
  ctx: Context,
  request: { sessionId: string; conflictId: string; resolution: 'keep' | 'restore' | 'recreate' | 'trash' },
  executorFor: (id: string) => RevertExecutor,
  _blobStore: BlobStore,
  stateFor: (session: Session) => SessionRevertState,
  manifestFor: (id: string) => MutationManifest,
): Promise<{ outcome?: unknown }> {
  const executor = executorFor(request.sessionId)
  const sessions = ctx.get('sessions') as { get?: (id: string) => Session } | undefined
  const session = sessions?.get?.(request.sessionId)
  if (session === undefined) throw new Error('session not found')
  const conflictEvent = [...session.events].reverse().find(e =>
    (e as unknown as { type: string }).type === 'revert/file-conflict'
    && (e.data as { conflictId?: string }).conflictId === request.conflictId)
  if (conflictEvent === undefined) throw new Error(`conflict ${request.conflictId} not found`)
  const conflict = (conflictEvent as unknown as {
    data: {
      targetKey: string
      state: string
      mode?: 'revert' | 'restore'
      boundarySeq?: number | null
      spanStartSeq?: number
      targetBlobSha?: string | null
      targetAbsent?: boolean
      spanPreExisted?: boolean
      sessionCreated?: boolean
      preSha: string | null
      postSha: string | null
      currentSha: string | null
    }
  }).data

  // Stale-card gate (Oracle E-class): a card from an earlier boundary must not
  // be resolvable after the session moved on (e.g. restore-all then resolving
  // an old revert card would write stale content). Only the card matching the
  // CURRENT folded boundary is actionable. stateFor folds the boundary from the
  // session log on first touch, so the gate also holds after a host restart.
  const state = stateFor(session)
  if (state.boundary !== (conflict.boundarySeq ?? null)) {
    diag(`file-revert/resolve: stale conflict ${request.conflictId} for ${request.sessionId} (card boundary=${String(conflict.boundarySeq ?? null)}, current=${String(state.boundary)}) — refusing`)
    throw new Error('conflict is stale: the session boundary moved since this card was shown')
  }

  // Resolution semantics (Oracle-certified):
  // - keep: leave disk untouched.
  // - restore: apply boundary target state. If target is absence (e.g. backward revert past creation), trash current file.
  //            If target has a SHA, write targetBlobSha.
  // - recreate: rebuild from targetBlobSha ?? postSha ?? preSha.
  // - trash: explicitly move current file to trash staging area.
  let resolution = request.resolution
  let targetBlobSha: string | null = null

  if (resolution === 'keep') {
    targetBlobSha = null
  } else if (resolution === 'restore') {
    if (conflict.targetAbsent === true) {
      resolution = 'trash'
      targetBlobSha = null
    } else if (conflict.targetBlobSha !== undefined && conflict.targetBlobSha !== null) {
      targetBlobSha = conflict.targetBlobSha
    } else if (conflict.mode === 'restore' && conflict.postSha !== null) {
      targetBlobSha = conflict.postSha
    } else if (conflict.preSha !== null) {
      targetBlobSha = conflict.preSha
    } else {
      resolution = 'trash'
    }
  } else if (resolution === 'recreate') {
    targetBlobSha = conflict.targetBlobSha ?? conflict.postSha ?? conflict.preSha
  } else if (resolution === 'trash') {
    resolution = 'trash'
  }

  // Save Beside: when the user edited on top (file exists on disk), the
  // pre-agent snapshot is written to a NEW path beside the original
  // (`<base>.pre-revert.<ts>`), leaving the user's version untouched. For a
  // MISSING conflict (file absent) recreate restores at the original path.
  // Collision-safe: append a counter when the target already exists.
  const besidePathOf = async (key: string): Promise<string> => {
    const slash = key.lastIndexOf('/')
    const dir = slash === -1 ? '.' : key.slice(0, slash)
    const base = slash === -1 ? key : key.slice(slash + 1)
    const ts = Date.now()
    let candidate = `${dir}/${base}.pre-revert.${ts}`
    let counter = 2
    while (true) {
      try {
        await import('node:fs/promises').then(m => m.stat(candidate))
        candidate = `${dir}/${base}.pre-revert.${ts}.${counter}`
        counter += 1
      } catch {
        break
      }
    }
    return candidate
  }

  const outcome = await executor.applyResolution({
    sessionId: request.sessionId,
    targetKey: conflict.targetKey,
    resolution,
    targetBlobSha,
    expectedDiskSha: conflict.currentSha,
    beside: resolution === 'recreate' && conflict.currentSha !== null,
    resolvePath: async (key: string) => (resolution === 'recreate' && conflict.currentSha !== null ? besidePathOf(key) : key),
    readDisk: async (key: string) => readDiskBytes(ctx, key),
    writeDisk: async (path: string, bytes: Buffer) => executor.atomicWrite(path, bytes),
    trashFile: async (path: string) => executor.trash(path, request.sessionId),
  })

  // Keep: record the kept disk state as a known mutation so a later restore
  // (or another revert) does not re-flag the same manual edit as a conflict.
  // The record is a no-op transition (pre === post === current disk) that the
  // evaluator's isKnownSpanState scan recognizes. Its toolSeq is the highest
  // possible so restore-all resolves the kept state as the target — a
  // subsequent restore sees currentSha === targetSha and no-ops instead of
  // overwriting the user's kept version.
  if (resolution === 'keep' && conflict.currentSha !== null) {
    try {
      const manifest = manifestFor(request.sessionId)
      await manifest.append({
        sessionId: request.sessionId,
        toolSeq: Number.MAX_SAFE_INTEGER - 1,
        callId: `keep-${request.conflictId}`,
        targetKey: conflict.targetKey,
        displayPath: conflict.targetKey,
        operation: 'update',
        preExisted: true,
        preStatus: 'ok',
        preBlobSha: conflict.currentSha,
        postStatus: 'ok',
        postBlobSha: conflict.currentSha,
        isInterleaved: false,
        timestamp: Date.now(),
      })
    } catch (err) {
      diag(`keep: failed to record kept state for ${conflict.targetKey}: ${String(err)}`)
    }
  }

  // Mirror the resolution into the session log so the client can close the modal.
  appendIgnorable(session, 'revert/file-result', {
    revertSeq: conflict.boundarySeq ?? -1,
    outcomes: { [conflict.targetKey]: outcome },
  })
  return { outcome }
}

// ── Recovery & GC ────────────────────────────────────────────────────────────

async function recoverUnsealedIntents(
  ctx: Context,
  executorFor: (id: string) => RevertExecutor,
): Promise<void> {
  try {
    const { readdir } = await import('node:fs/promises')
    const sessions = await readdir(FILE_HISTORY_ROOT, { withFileTypes: true })
    for (const entry of sessions) {
      if (!entry.isDirectory()) continue
      const executor = executorFor(entry.name)
      const unsealed = await executor.findUnsealedIntents()
      for (const intent of unsealed) {
        diag(`recovering unsealed intent ${intent.revertSeq} for ${entry.name}`)
        const plan = new Map<string, { action: string; targetBlobSha: string | null; expectedDiskSha: string | null }>(
        Object.entries(intent.plan).map(([key, p]) => {
          const rec = p as { action: string; targetBlobSha: string | null; expectedDiskSha: string | null }
          return [key, { action: rec.action, targetBlobSha: rec.targetBlobSha, expectedDiskSha: rec.expectedDiskSha }]
        }),
      )
        await executor.execute({
          sessionId: entry.name,
          revertSeq: intent.revertSeq,
          plan,
          resolvePath: async (key: string) => key,
          readDisk: async (key: string) => readDiskBytes(ctx, key),
          writeDisk: async (path: string, bytes: Buffer) => executor.atomicWrite(path, bytes),
          trashFile: async (path: string) => executor.trash(path, entry.name),
        })
      }
    }
  } catch (err) {
    diag(`recovery scan failed: ${String(err)}`)
  }
}

async function runGc(
  manifests: Map<string, MutationManifest>,
  executors: Map<string, RevertExecutor>,
  blobStore: BlobStore,
  ttlMs: number,
): Promise<void> {
  // Liveness must be DISK-derived: the manifests Map is lazily populated, so a
  // capture-only session untouched since restart would contribute zero SHAs and
  // its live snapshots would be swept. Read every manifest.jsonl from disk.
  const live = new Set<string>()
  const { readdir, readFile } = await import('node:fs/promises')
  const sessions = await readdir(FILE_HISTORY_ROOT, { withFileTypes: true })
  for (const entry of sessions) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(FILE_HISTORY_ROOT, entry.name, 'manifest.jsonl'), 'utf8')
      for (const line of raw.split('\n')) {
        if (line.length === 0) continue
        try {
          const rec = JSON.parse(line) as { preBlobSha?: string | null; postBlobSha?: string | null }
          if (rec.preBlobSha) live.add(rec.preBlobSha)
          if (rec.postBlobSha) live.add(rec.postBlobSha)
        } catch { /* torn line — skip */ }
      }
    } catch { /* no manifest for this session */ }
  }
  for (const e of executors.values()) for (const sha of e.liveShas()) live.add(sha)
  await blobStore.gc(live, ttlMs)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findActiveChildren(ctx: Context, parentId: string): Promise<string[]> {
  const sessions = ctx.get('sessions') as { get?: (id: string) => Session } | undefined
  const parent = sessions?.get?.(parentId)
  if (parent === undefined) return []
  const children: string[] = []
  for (const event of parent.events) {
    const e = event as unknown as { type: string; data: { childSessionId?: string } }
    if (e.type !== 'subagent/descriptor') continue
    if (e.data.childSessionId !== undefined && ctx.agents.get(e.data.childSessionId as SessionId) !== undefined) {
      children.push(e.data.childSessionId)
    }
  }
  return children
}

async function readDiskBytes(ctx: Context, targetKey: string): Promise<Buffer | null> {
  const { readFile } = await import('node:fs/promises')
  try {
    return await readFile(targetKey)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}