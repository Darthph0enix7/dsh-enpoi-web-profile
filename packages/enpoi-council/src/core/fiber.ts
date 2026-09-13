/**
 * Council fiber lifecycle — ported from the pre-redesign engine and
 * generalized to seats (doc 54). Preserves the five anti-leak measures:
 *   - dual-level quiet (spec.quiet + request.quiet)  [c4726c2ad8]
 *   - send_message denied                             [335ffa7]
 *   - text-only extraction (no reasoning blocks)      [3b15d87]
 *   - I12 route pinning via personas at spawn
 *   - unconditional deny list (unknown names are no-ops)
 *
 * Evidence fencing (doc 54 §6): DEBATER fibers deny all retrieval tools —
 * their only ingress to facts is the NEED_EVIDENCE text protocol serviced by
 * the broker. BROKER children (explorer/librarian role) keep the research
 * surface and deny everything else.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, Session, SessionId } from '@deepseek-ai/dsh-agent'
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { getBriefService } from 'dsh-enpoi-context-keeper'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const LOG_FILE = path.join(os.homedir(), '.dsh', 'logs', 'enpoi-council.log')
export function councilDiag(msg: string) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

/** Bounded wait for the demand-driven Living Brief before council start. */
export const BRIEF_WAIT_MS = 4_000

export async function ensureBriefWithin(parent: Agent, signal: AbortSignal, waitMs = BRIEF_WAIT_MS): Promise<void> {
  const brief = getBriefService()
  if (brief === null || brief === undefined) return
  const pending = brief.ensureFreshBrief(parent.session, signal).catch((error: unknown) => {
    councilDiag(`brief wait degraded: ${String(error)}`)
    return null
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs) })
  try {
    await Promise.race([pending.then(() => undefined), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (signal.aborted) throw signal.reason ?? new Error('aborted')
}

/** Extract the final report text from message blocks (reasoning excluded). */
export function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content !== null && typeof content === 'object') {
    if ('message' in content && typeof (content as { message: unknown }).message === 'object') {
      const inner = (content as { message: { content?: unknown } }).message?.content
      if (inner !== undefined) return textOfContent(inner)
    }
    if ('text' in content && typeof (content as { text: unknown }).text === 'string') {
      return (content as { text: string }).text
    }
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part !== null && typeof part === 'object') {
          const blockType = (part as { type?: unknown }).type
          if ((blockType === 'text' || blockType === undefined)
            && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
            return (part as { text: string }).text
          }
        }
        return ''
      })
      .filter((t) => t.length > 0)
      .join('\n')
  }
  return ''
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Base deny list for EVERY council fiber (anti-leak). Passed UNCONDITIONALLY —
// the fork's tools.restrict() skips unknown deny names safely.
// NOTE: `run_code` is deliberately absent — the PTC transport is reserved and
// naming it in a filter throws (doc 52).
export const COUNCIL_DENIED_TOOLS = [
  'send_message',
  'oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex',
  'subagent_claude_code', 'bash', 'edit', 'write', 'str_replace_editor',
  'todo_write', 'plan_mode', 'goal', 'roundtable', 'chorus',
  'memory_save', 'memory_search', 'memory_rescind', 'memory_confirm',
  'workflow', 'ralph',
  'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode',
  'job_output', 'job_list', 'job_kill',
  'skill', 'ask_user_question',
  // Councils cannot register sub-councils (amendment #10)
  'council_register',
]

// Evidence fencing: deliberation seats additionally lose ALL retrieval tools.
// Their only ingress to facts is the NEED_EVIDENCE protocol (doc 54 §6,
// Oracle amendment #2 — no DECLARED_READ loophole).
export const RETRIEVAL_TOOLS = ['read', 'glob', 'grep', 'read_image', 'web_search', 'web_fetch'] as const

export const DEBATER_DENIED_TOOLS = [...COUNCIL_DENIED_TOOLS, ...RETRIEVAL_TOOLS]

// The BROKER child keeps the research surface (it is the errand boy's door).
export const BROKER_KEPT_TOOLS = [...RETRIEVAL_TOOLS]

export interface PersonaModelConfig {
  provider: string
  model: string
  reasoningEffort?: string
}

export function resolvePersonaModel(ctx: Context, persona: string): PersonaModelConfig | undefined {
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => { personas?: Record<string, { provider?: string; model?: string; reasoningEffort?: string }> } } | undefined
    const doc = settings?.get?.('enpoi-orchestration')
    const key = persona.toLowerCase().replace(/^the\s+/, '').trim()
    const entry = doc?.personas?.[key]
    if (entry && entry.provider && entry.model) {
      return {
        provider: entry.provider,
        model: entry.model,
        ...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
      }
    }
  } catch (err: unknown) {
    councilDiag(`resolvePersonaModel error for ${persona}: ${String(err)}`)
  }
  return undefined
}

export function applyPersonaModel(ctx: Context, childId: string, persona: string): void {
  try {
    const entry = resolvePersonaModel(ctx, persona)
    if (entry && entry.provider && entry.model) {
      const sessions = ctx.get('sessions') as { get?: (id: string) => Session } | undefined
      const childSession = sessions?.get?.(childId)
      if (childSession && typeof childSession.append === 'function') {
        childSession.append('request/header', {
          header: {
            config: {
              provider: entry.provider,
              model: entry.model,
              ...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
            },
          },
          reason: 'custom',
        })
        councilDiag(`Applied persona model header for ${persona}: ${entry.provider}/${entry.model}`)
      }
    }
  } catch (err: unknown) {
    councilDiag(`applyPersonaModel warning for ${persona}: ${String(err)}`)
  }
}

export interface SeatFiber {
  seatId: string
  label: string
  childId: string
  isOffline: boolean
  totalTokens: number
}

/**
 * Spawn one quiet continuable fiber for a council seat.
 * `denyTools` selects the fencing tier (debater vs broker).
 */
export async function startSeatFiber(
  ctx: Context,
  parent: Agent,
  opts: {
    seatId: string
    label: string
    persona: string
    initialPrompt: string
    denyTools: readonly string[]
  },
  signal: AbortSignal,
): Promise<SeatFiber> {
  const personaModel = resolvePersonaModel(ctx, opts.seatId)
  const started = await ctx.subagents.startContinuable({
    provider: 'spawn',
    label: opts.label,
    quiet: true,
    request: {
      prompt: [{ type: 'text', text: opts.initialPrompt }],
      parent,
      persona: opts.persona,
      quiet: true,
      toolFilter: opts.denyTools.length > 0 ? { deny: [...opts.denyTools] } : undefined,
      ...(personaModel !== undefined ? {
        agentOptions: { provider: personaModel.provider, model: personaModel.model },
      } : {}),
    },
    signal,
  })
  if (!started.childId || started.childId === 'null' || !String(started.childId).includes('-')) {
    throw new Error(`council seat spawn returned an invalid child id for ${opts.seatId}: ${String(started.childId)}`)
  }
  applyPersonaModel(ctx, started.childId, opts.seatId)
  return { seatId: opts.seatId, label: opts.label, childId: started.childId, isOffline: false, totalTokens: 0 }
}

/** Follow-up turn on an existing seat fiber; bounded so a stuck lock fails loud. */
export async function followupSeatFiber(
  ctx: Context,
  parent: Agent,
  fiber: SeatFiber,
  promptText: string,
  signal: AbortSignal,
  timeoutMs = 30_000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      queueHostSubagentPrompt(
        ctx.subagents,
        parent,
        fiber.childId as SessionId,
        [{ type: 'text', text: promptText }],
        { kind: 'user' },
        signal,
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`council followup to ${fiber.seatId} (${fiber.childId}) timed out after ${timeoutMs}ms — child activation lock stuck`))
        }, timeoutMs)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('council followup aborted'))
        }, { once: true })
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Poll a child session until its turn settles; return the extracted text.
 * Detects provider errors from turn/end immediately.
 */
export async function waitForSeatTurn(
  ctx: Context,
  childId: string,
  signal: AbortSignal,
  timeoutMs = 90_000,
): Promise<string> {
  const started = Date.now()
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) throw new Error('council deliberation aborted')
      if (Date.now() - started > timeoutMs) throw new Error(`council seat timed out after ${timeoutMs}ms`)
      if (ctx.agents.get(childId as SessionId) === undefined) {
        const persistence = ctx.get('sessionPersistence') as SessionPersistence | undefined
        if (persistence !== undefined) {
          const handle = await persistence.open(childId as SessionId, 'read')
          let events: readonly SessionEvent[]
          try {
            events = (await handle.read(0, undefined)).events
          } finally {
            await handle.close()
          }
          const lastUser = [...events].reverse().find(e => e.type === 'user/message')
          const since = lastUser === undefined ? 0 : lastUser.seq
          const messages = events.filter(e => e.type === 'assistant/message' && e.seq > since)
          if (messages.length > 0) {
            const extracted = messages
              .map(m => {
                const data = m.data as { message?: { content?: unknown }; content?: unknown }
                return textOfContent(data.message?.content ?? data.content)
              })
              .filter(t => t.length > 0)
              .join('\n')
              .trim()
            if (extracted.length > 0) return extracted
          }
          const turnEnd = events.find(e => e.type === 'turn/end' && e.seq > since)
          if (turnEnd !== undefined) {
            const reason = (turnEnd.data as { reason?: { kind?: string; error?: { message?: string }; failure?: { message?: string }; reason?: { kind?: string } } })?.reason
            if (reason?.kind === 'error') {
              throw new Error(`Turn failed: ${reason.error?.message ?? reason.failure?.message ?? 'Model execution failed'}`)
            }
            if (reason?.kind === 'aborted') {
              throw new Error(`Turn was aborted (${reason.reason?.kind ?? 'cancelled'})`)
            }
            if (reason?.kind === 'completed' && messages.length === 0) {
              return '[NO_OUTPUT: seat returned empty content]'
            }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export interface SeatTurn {
  seatId: string
  text: string
  tokens: number
  error?: string
}

/** Dispose seat fibers (best-effort). */
export async function disposeSeatFibers(ctx: Context, fibers: { childId: string }[]): Promise<void> {
  for (const fiber of fibers) {
    if (!fiber.childId) continue
    try {
      const sessionStore = ctx.get('sessions')
      if (sessionStore !== undefined) {
        await sessionStore.delete(fiber.childId as SessionId)
      }
    } catch {
      /* best-effort disposal */
    }
  }
}

/** Read the Living Brief projection snapshot for context injection. */
export function getLivingBriefText(ctx: Context, parent: Agent): string {
  try {
    const projections = ctx.get('sessionProjections') as
      { snapshot?: (s: Session) => { values?: { livingBrief?: { goal?: string; prose?: { text?: string }; decisions?: Array<{ text: string }>; goalSeq?: number } } } } | undefined
    const snap = projections?.snapshot?.(parent.session)
    const lb = snap?.values?.livingBrief
    if (lb) {
      const goal = lb.goal ? `Goal: ${lb.goal}` : ''
      const prose = lb.prose?.text ?? ''
      const decisions = lb.decisions && lb.decisions.length > 0
        ? `Decisions:\n${lb.decisions.map(d => `• ${d.text}`).join('\n')}`
        : ''
      return [goal, prose, decisions].filter(Boolean).join('\n\n')
    }
  } catch {
    /* no living brief */
  }
  return ''
}
