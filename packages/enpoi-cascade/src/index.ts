/**
 * Enpoi Harness — `enpoi-cascade` (user-stop cancellation).
 *
 * When the user stops the main agent, everything stops:
 * - Every continuable descendant of the aborted session is drained via the
 *   engine's native `drainContinuableDescendants` (recursive, park-semantics).
 * - In-flight spawn coordinators (oracle/dispatcher) trip their pending
 *   reservations synchronously (I6 latch).
 * - The context keeper is EXEMPT (I9) — it is not a subagent, so the drain
 *   never touches it.
 *
 * The hook: `agent/turn-stopping` is BYPASSED on abort (verified in source —
 * user cancel aborts the turn signal and jumps past the natural-end hook), so
 * we subscribe to the durable `session/event` `turn/end` record with
 * `reason.kind === 'aborted'` + `reason.reason.kind === 'user'`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export const name = 'enpoi-cascade'

// Minimal file diagnostics — the Cordis logger only buffers (no console sink).
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
function diag(line: string): void {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? '/tmp'
    const dir = home.endsWith('.dsh') ? home : join(home, '.dsh')
    mkdirSync(join(dir, 'logs'), { recursive: true })
    appendFileSync(join(dir, 'logs', 'enpoi-cascade.log'), `${new Date().toISOString()} ${line}\n`)
  } catch { /* diagnostics never throw */ }
}

export function apply(ctx: Context): void {
  // Listen on OUR ctx (proven to receive session events — the root does not).
  ctx.on('session/event', (session, event: SessionEvent) => {
    if (event.type !== 'turn/end') return
    const reason = event.data.reason
    if (reason.kind !== 'aborted') return
    const cancelCause = reason.reason
    if (cancelCause === undefined || cancelCause.kind !== 'user') return

    diag(`user stop detected for session ${session.id} — draining descendants`)
    const subagents = ctx.get('subagents')
    const agent = ctx.get('agents')?.get(session.id)
    if (subagents !== undefined) {
      if (agent !== undefined) {
        // Recursive descendant drain: children + grandchildren park/abort.
        void subagents.drainContinuableDescendants([agent]).catch((error: unknown) => {
          ctx.logger.warn(`[enpoi-cascade] descendant drain failed: ${String(error)}`)
        })
      }
    }
  })
}
