/**
 * enpoi-memory — Cordis plugin: boot reconcile, per-session bounded injection,
 * and the memory tools. Exposes no service — keeper/dispatcher/CLI open the
 * same DB file through their own connections (WAL + BEGIN IMMEDIATE serialize).
 */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openMemoryDb } from './db'
import { makePipeline } from './pipeline'
import { buildMemoryBlock } from './retriever'
import { registerMemoryTools } from './tools'

/** Shared DB/pipeline access for sibling plugins (keeper, dispatcher, CLI). */
export { openMemoryDb } from './db'
export { makePipeline } from './pipeline'

const LOG_DIR = join(process.env.HOME ?? '', '.dsh', 'logs')
function diag(line: string): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(join(LOG_DIR, 'enpoi-memory.log'), `${new Date().toISOString()} ${line}\n`)
  } catch { /* best-effort */ }
}

export const name = 'enpoi-memory'
export const inject = ['tools']

/** Per-session anti-repeat state (A3.2): last N turn windows of injected ids. */
const RECENT_WINDOW = 6

export function apply(ctx: Context): void {
  const db = openMemoryDb()
  const pipeline = makePipeline(db)
  const recent = new Map<string, string[]>() // sessionId -> queue of claim ids (newest last)
  const injectedSessions = new Set<string>() // sessions that already received the block

  // Boot reconciliation (I10, doc 35 4.1): any crash-leftover tentative → orphaned.
  void pipeline.reconcileBoot().then(n => {
    if (n > 0) ctx.logger?.warn(`enpoi-memory: boot reconciled ${n} tentative claim(s) → orphaned_cancelled`)
  })

  registerMemoryTools(ctx, db, pipeline)

  // ── Per-session bounded injection (doc 36 §2.5) ───────────────────────────
  // A REAL user prompt on a MAIN session builds one <=1,200-char [PROJECT
  // MEMORY] block and injects it as a plugin user-message, so it lands in the
  // next step's context (placement after the cached prefix; the runtime
  // dedupes no-op injections by content). Injected at most ONCE per session —
  // the first qualifying user turn; later turns add nothing. Subagent/oracle
  // children are skipped — they receive the Living Brief package instead (no
  // double context). A3.2 anti-repeat bookkeeping stays: claims already
  // injected within the recent window are excluded, and an empty block costs
  // zero chars.
  ctx.on('session/event', (session, event: SessionEvent) => {
    if (event.type !== 'user/message') return
    const data = event.data as {
      readonly source?: { readonly kind?: string }
      readonly content?: readonly { readonly type?: string; readonly text?: string }[]
    }
    if (data.source?.kind !== 'user') return
    // Main sessions only: subagent/oracle children receive the Living Brief.
    if (session.header.parentSession !== undefined) return
    const query = (data.content ?? [])
      .filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text as string)
      .join('\n')
    if (query.trim().length === 0) return

    const sessionId = session.id
    // Once per session: only the first qualifying user turn injects.
    if (injectedSessions.has(sessionId)) return

    const window = recent.get(sessionId) ?? []
    let result: { block: string; claimIds: string[] } | null = null
    try {
      result = buildMemoryBlock(db, query, new Set(window))
    } catch (error) {
      diag(`inject: build failed for ${sessionId}: ${String(error)}`)
      return
    }
    if (result === null) return

    // Defer: this listener runs DURING the user-message append's publication,
    // and a synchronous agent.inject() re-enters the append guard
    // ("session append cannot reenter while another append is being published").
    // A macrotask lands after the publish window; the agent is re-resolved then.
    const payload = result
    injectedSessions.add(sessionId) // claim before deferring; released on failure
    setTimeout(() => {
      try {
        const agent = ctx.get('agents')?.get(sessionId) as
          | { inject(message: unknown): void }
          | undefined
        if (agent === undefined) {
          injectedSessions.delete(sessionId)
          return
        }
        agent.inject(createUserMessage({
          content: [{ type: 'text', text: payload.block }],
          source: { kind: 'plugin', plugin: 'enpoi-memory' },
        }))
        recent.set(sessionId, [...window, ...payload.claimIds].slice(-RECENT_WINDOW * 3))
        diag(`inject: session=${sessionId} — ${payload.claimIds.length} claim(s), ${payload.block.length} chars`)
      } catch (error) {
        injectedSessions.delete(sessionId)
        diag(`inject: failed for ${sessionId}: ${String(error)}`)
      }
    }, 0)
  })

}
