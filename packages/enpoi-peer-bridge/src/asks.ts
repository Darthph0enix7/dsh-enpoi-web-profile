/**
 * Remote-ask surfacing: how a pending ask on the far side reaches the local
 * operator, and how the local decision maps back onto `peer.answer`.
 *
 * The primary channel is the local approval service (`ctx.approval.request`),
 * raised from inside the `peer_ask` turn that is following the remote turn;
 * the answer maps one-to-one onto the peer vocabulary. When the local service
 * cannot be used (no `approval` service, no agent, no open turn, or a question
 * ask that the approval vocabulary cannot represent), the bridge records a
 * durable notice under `$DSH_HOME/peer-bridge/asks.jsonl` and leaves the ask
 * answerable through `peer_answer` / `ds peer answer` — never silently
 * auto-answered.
 *
 * @module dsh-enpoi-peer-bridge/asks
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PeerPendingAsk } from './peer-client.js'

/** What the local approval service decided about a remote ask. */
export type LocalAskDecision = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' | 'unsurfaced'

/** One ask's lifecycle as the bridge reports it to the local model/operator. */
export interface AskRecord {
  readonly askId: string
  readonly kind: 'approval' | 'question'
  readonly toolName?: string
  readonly reason?: string
  /** Filled in as the ask is surfaced (approval card) or noticed (durable file). */
  surfaced: 'approval' | 'notice'
  /** Local decision when one was made; absent while the ask is still pending. */
  decision?: LocalAskDecision
  /** Peer answer relay outcome: settled, conflict, not-found, or relay-failed. */
  relay?: 'settled' | 'conflict' | 'not-found' | 'failed'
  note?: string
}

/** Human label for one remote ask, used on the local approval card and in tool output. */
export function askLabel(alias: string, sessionId: string, ask: Pick<PeerPendingAsk, 'kind' | 'toolName' | 'reason'>): string {
  const what = ask.kind === 'approval' ? `approval for tool "${ask.toolName ?? 'unknown'}"` : 'a user question'
  const why = ask.reason === undefined || ask.reason === '' ? '' : ` — ${ask.reason}`
  return `remote ask on ${alias} (${sessionId}): ${what}${why}`
}

/**
 * Map one local approval outcome onto the peer answer vocabulary.
 * `allowed-always` and the fail-closed outcomes never convert: a peer may
 * grant `allowed-once` or `rejected` only (doc 70 §5.5), and an unanswered
 * ask stays answerable rather than being auto-rejected.
 * @param decision - local service outcome.
 * @returns the peer outcome when relayable, plus the operator-facing note.
 */
export function localDecisionToPeerAnswer(decision: LocalAskDecision): { readonly outcome?: 'allowed-once' | 'rejected'; readonly note: string } {
  switch (decision) {
    case 'allowed-once':
      return { outcome: 'allowed-once', note: 'local operator approved once → relayed as allowed-once' }
    case 'rejected':
      return { outcome: 'rejected', note: 'local operator rejected → relayed as rejected' }
    case 'cancelled':
      return { note: 'local approval was withdrawn/cancelled — remote ask left unanswered' }
    case 'unavailable':
      return { note: 'local approval channel unavailable (no answerer/timeout) — remote ask left unanswered' }
    case 'unsurfaced':
      return { note: 'local approval service unavailable — ask recorded as a durable notice and left answerable via peer_answer' }
  }
}

/** One-line summary of a pending ask for tool output and notices. */
export function askSummary(ask: PeerPendingAsk): string {
  if (ask.kind === 'approval') {
    const reason = ask.reason === undefined || ask.reason === '' ? '' : ` (${ask.reason})`
    return `approval ${ask.askId} tool=${ask.toolName ?? 'unknown'}${reason}`
  }
  const count = Array.isArray(ask.questions) ? ask.questions.length : 0
  return `question ${ask.askId} (${String(count)} item${count === 1 ? '' : 's'})`
}

/** One durable notice record; the fallback channel when the local service cannot be used. */
export interface AskNotice {
  readonly at: number
  readonly alias: string
  readonly sessionId: string
  readonly askId: string
  readonly kind: 'approval' | 'question'
  readonly toolName?: string
  readonly reason?: string
  readonly questions?: unknown
  readonly note: string
}

/**
 * Append one ask notice to the durable JSONL file (created on first write).
 * @param path - notice file path.
 * @param notice - notice record.
 */
export function appendAskNotice(path: string, notice: AskNotice): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(notice)}\n`, { mode: 0o600 })
  } catch {
    // A notice file failure must never take the bridge or the local turn down.
  }
}

/** Default durable notice location beside the pairing document. */
export function defaultNoticesPath(dshHome: string): string {
  return `${dshHome.replace(/\/+$/u, '')}/peer-bridge/asks.jsonl`
}
