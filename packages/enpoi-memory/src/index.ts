/**
 * enpoi-memory — Cordis plugin: boot reconcile, per-turn bounded injection,
 * and the memory tools. Exposes no service — keeper/dispatcher/CLI open the
 * same DB file through their own connections (WAL + BEGIN IMMEDIATE serialize).
 */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openMemoryDb } from './db'
import { makePipeline } from './pipeline'
import { buildMemoryBlock } from './retriever'
import { registerMemoryTools } from './tools'

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

  // Boot reconciliation (I10, doc 35 4.1): any crash-leftover tentative → orphaned.
  void pipeline.reconcileBoot().then(n => {
    if (n > 0) ctx.logger?.warn(`enpoi-memory: boot reconciled ${n} tentative claim(s) → orphaned_cancelled`)
  })

  registerMemoryTools(ctx, db, pipeline)

}
