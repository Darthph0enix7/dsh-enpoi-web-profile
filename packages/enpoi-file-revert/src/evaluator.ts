/**
 * The 6-state conflict matrix (Doc 44 §4) + revert plan builder.
 * postBlobSha nullability is explicit: null post-state degrades to prompt paths.
 */

import { sha256Of } from './blob-store'
import type { SpanEntry } from './manifest'

export const STATE = {
  CLEAN_RESTORE: 'clean_restore',
  CLEAN_TRASH: 'clean_trash',
  ALREADY_CLEAN: 'already_clean',
  CONFLICT: 'conflict',
  ALREADY_ABSENT: 'already_absent',
  MISSING: 'missing',
  UNAVAILABLE: 'unavailable',
} as const

export type RevertState = typeof STATE[keyof typeof STATE]

export interface EvalResult {
  state: RevertState
  action: 'restore' | 'trash' | 'noop' | 'prompt' | 'skip'
  targetBlobSha: string | null
  expectedDiskSha: string | null
  reason?: string
}

export function evaluateFile(entry: SpanEntry, currentDisk: Buffer | null): EvalResult {
  const { initialPre, finalPost } = entry
  const currentSha = currentDisk === null ? null : sha256Of(currentDisk)
  const postSha = finalPost.postBlobSha
  const preSha = initialPre.preBlobSha

  // Case 6: pre-state unavailable (too-large / unreadable) -> never auto-revert.
  if (initialPre.preExisted && initialPre.preStatus !== 'ok') {
    return {
      state: STATE.UNAVAILABLE,
      action: 'skip',
      targetBlobSha: null,
      expectedDiskSha: currentSha,
      reason: `pre-agent snapshot unavailable (${initialPre.preStatus})`,
    }
  }

  // Post-state capture failed: we cannot verify the agent's final state, so
  // auto-revert is impossible — degrade to a prompt (never guess).
  if (finalPost.postStatus !== 'ok' || postSha === null) {
    return {
      state: STATE.UNAVAILABLE,
      action: 'skip',
      targetBlobSha: preSha,
      expectedDiskSha: currentSha,
      reason: `post-agent snapshot unavailable (${finalPost.postStatus})`,
    }
  }

  if (currentSha === null) {
    if (!initialPre.preExisted) {
      return { state: STATE.ALREADY_ABSENT, action: 'noop', targetBlobSha: null, expectedDiskSha: null }
    }
    return {
      state: STATE.MISSING,
      action: 'prompt',
      targetBlobSha: preSha,
      expectedDiskSha: null,
      reason: 'file was present before the agent edits but is missing on disk',
    }
  }

  if (currentSha === postSha) {
    if (!initialPre.preExisted) {
      return { state: STATE.CLEAN_TRASH, action: 'trash', targetBlobSha: null, expectedDiskSha: postSha }
    }
    if (initialPre.preStatus === 'ok') {
      return { state: STATE.CLEAN_RESTORE, action: 'restore', targetBlobSha: preSha, expectedDiskSha: postSha }
    }
    return {
      state: STATE.UNAVAILABLE,
      action: 'skip',
      targetBlobSha: null,
      expectedDiskSha: postSha,
      reason: `pre-agent snapshot unavailable (${initialPre.preStatus})`,
    }
  }

  if (preSha !== null && currentSha === preSha) {
    return { state: STATE.ALREADY_CLEAN, action: 'noop', targetBlobSha: null, expectedDiskSha: currentSha }
  }

  return {
    state: STATE.CONFLICT,
    action: 'prompt',
    targetBlobSha: preSha,
    expectedDiskSha: currentSha,
    reason: 'current disk content differs from both the agent post-state and the pre-agent state',
  }
}

export interface PlanEntry extends EvalResult {
  entry: SpanEntry
}

/**
 * Boundary-based evaluation: the target state is the state AT the revert
 * boundary (initialPre for a new revert, finalPost for restore-all, or the
 * latest mutation ≤ seq for partial restore). Compares current disk against
 * both the target and the final post-state.
 */
export function evaluateBoundary(
  entry: SpanEntry,
  target: { preExisted: boolean; preStatus: string; preBlobSha: string | null; postBlobSha: string | null },
  currentSha: string | null,
): EvalResult {
  const { initialPre, finalPost } = entry
  const postSha = finalPost.postBlobSha
  const preSha = initialPre.preBlobSha
  const targetSha = target.postBlobSha ?? target.preBlobSha
  const targetAbsent = target.postBlobSha === null && target.preBlobSha === null

  // Case 6: pre-state unavailable (too-large / unreadable) -> never auto-revert.
  if (initialPre.preExisted && initialPre.preStatus !== 'ok') {
    return {
      state: STATE.UNAVAILABLE,
      action: 'skip',
      targetBlobSha: null,
      expectedDiskSha: currentSha,
      reason: `pre-agent snapshot unavailable (${initialPre.preStatus})`,
    }
  }

  // Post-state capture failed: we cannot verify the agent's final state.
  if (finalPost.postStatus !== 'ok' || postSha === null) {
    return {
      state: STATE.UNAVAILABLE,
      action: 'skip',
      targetBlobSha: targetSha,
      expectedDiskSha: currentSha,
      reason: `post-agent snapshot unavailable (${finalPost.postStatus})`,
    }
  }

  if (currentSha === null) {
    // Disk absent.
    if (targetAbsent) {
      return { state: STATE.ALREADY_ABSENT, action: 'noop', targetBlobSha: null, expectedDiskSha: null }
    }
    return {
      state: STATE.MISSING,
      action: 'prompt',
      targetBlobSha: targetSha,
      expectedDiskSha: null,
      reason: 'file is missing on disk but the revert boundary expects it to exist',
    }
  }

  if (currentSha === targetSha) {
    // Disk already at the boundary state -> no-op.
    return { state: STATE.ALREADY_CLEAN, action: 'noop', targetBlobSha: null, expectedDiskSha: currentSha }
  }

  if (currentSha === postSha || (preSha !== null && currentSha === preSha)) {
    // Disk matches the agent's final state OR the pre-agent state — both are
    // clean ends of the span, so the transition to the boundary is safe.
    if (targetAbsent) {
      return { state: STATE.CLEAN_TRASH, action: 'trash', targetBlobSha: null, expectedDiskSha: postSha }
    }
    return { state: STATE.CLEAN_RESTORE, action: 'restore', targetBlobSha: targetSha, expectedDiskSha: currentSha }
  }

  // User edited on top -> conflict.
  return {
    state: STATE.CONFLICT,
    action: 'prompt',
    targetBlobSha: targetSha,
    expectedDiskSha: currentSha,
    reason: 'current disk content differs from both the boundary state and the agent post-state',
  }
}

export async function buildRevertPlan(
  manifest: { aggregateSpan(fromSeq: number): Map<string, SpanEntry> },
  fromSeq: number,
  readDisk: (targetKey: string) => Promise<Buffer | null>,
): Promise<{ plan: Map<string, PlanEntry>; conflicts: Array<PlanEntry & { displayPath: string }>; clean: Array<PlanEntry & { displayPath: string }> }> {
  const aggregated = manifest.aggregateSpan(fromSeq)
  const plan = new Map<string, PlanEntry>()
  const conflicts: Array<PlanEntry & { displayPath: string }> = []
  const clean: Array<PlanEntry & { displayPath: string }> = []
  for (const [targetKey, entry] of aggregated) {
    const currentDisk = await readDisk(targetKey)
    const evalResult = evaluateFile(entry, currentDisk)
    const planEntry: PlanEntry = { entry, ...evalResult }
    plan.set(targetKey, planEntry)
    if (evalResult.state === STATE.CONFLICT || evalResult.state === STATE.MISSING || evalResult.state === STATE.UNAVAILABLE) {
      conflicts.push({ ...planEntry, displayPath: entry.finalPost.displayPath })
    } else {
      clean.push({ ...planEntry, displayPath: entry.finalPost.displayPath })
    }
  }
  return { plan, conflicts, clean }
}