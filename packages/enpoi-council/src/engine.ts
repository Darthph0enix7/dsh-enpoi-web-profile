/**
 * enpoi-council — High Council execution engine.
 *
 * Implements continuable debater fiber lifecycle (startContinuable -> followup -> dispose),
 * parallel fan-out with 1 retry and 2/3 quorum rule (A4.2), cumulative token tracking (80k ceiling),
 * and TraceContext correlation across all debater interactions.
 *
 * @module dsh-enpoi-council/engine
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, Session, SessionId } from '@deepseek-ai/dsh-agent'
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createHash } from 'node:crypto'
import { getBriefService } from 'dsh-enpoi-context-keeper'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const LOG_FILE = path.join(os.homedir(), '.dsh', 'logs', 'enpoi-council.log')
function councilDiag(msg: string) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

export interface TraceContext {
  traceId: string
  runId: string
  persona: string
  parentSeq: number
  seq: number
}

/** Bounded wait for the demand-driven Living Brief before council start, in ms. */
export const BRIEF_WAIT_MS = 4_000

/**
 * Materialize the demand-driven brief without letting a slow keeper call delay
 * the council. The generation keeps running single-flight in the keeper, so a
 * later call consumes the fresh prose from cache; a hanging keeper route no
 * longer stalls the whole council for its full request timeout.
 * @param parent - live council parent whose session owns the brief.
 * @param signal - council-owned cancellation.
 * @param waitMs - bounded wait before proceeding with the deterministic fold.
 */
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

export interface DebaterFiberState {
  persona: string
  childId: string
  isOffline: boolean
  lastTurnSeq: number
  totalTokens: number
}

export interface DebaterResponse {
  persona: string
  childId: string
  text: string
  tokens: number
  isConcur: boolean
  error?: string
}

export const MAX_DEBATE_TOKENS = 180_000

/** Estimate token count roughly from character length (1 token ≈ 4 chars). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Extract the final report text from message blocks (reasoning excluded). */
export function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (content !== null && typeof content === 'object') {
    // If it's a message container: { message: { content: ... } }
    if ('message' in content && typeof (content as { message: unknown }).message === 'object') {
      const inner = (content as { message: { content?: unknown } }).message?.content
      if (inner !== undefined) return textOfContent(inner)
    }
    // If it has text property: { text: "..." }
    if ('text' in content && typeof (content as { text: unknown }).text === 'string') {
      return (content as { text: string }).text
    }
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part !== null && typeof part === 'object') {
          // Only report blocks are returned: a reasoning block carries its
          // own private deliberation and must never reach the parent. An
          // untyped block is legacy plain text and stays admissible.
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

/** Create a unique TraceContext. */
export function createTraceContext(
  persona: string,
  parent: Session,
  runId: string,
  seq: number,
): TraceContext {
  const hash = createHash('sha256')
    .update(`${parent.id}:${runId}:${persona}:${seq}`)
    .digest('hex')
    .slice(0, 12)
  return {
    traceId: `trace-${hash}`,
    runId,
    persona,
    parentSeq: parent.seq,
    seq,
  }
}

// Council fibers are quiet pure-reasoning children: only the orchestrating
// tool's final synthesis may reach the parent session. `send_message` is denied
// so a debater cannot relay its raw output into the parent inbox (the old
// report-tool leak this plugin was built to avoid).
//
// The deny list is passed UNCONDITIONALLY (no length guard beyond emptiness):
// the fork's `tools.restrict()` skips unknown deny names safely, so names that
// only exist in some harness builds are harmless here and future-proof.
export const COUNCIL_DENIED_TOOLS = [
  'send_message',
  'oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex',
  'subagent_claude_code', 'bash', 'edit', 'write', 'str_replace_editor',
  'todo_write', 'plan_mode', 'goal', 'roundtable', 'chorus',
  'memory_save', 'memory_search', 'memory_rescind', 'memory_confirm',
  // Code/execution escapes (NOTE: `run_code` is deliberately absent — the PTC
  // presentation transport is reserved and `tools.restrict()` throws when a
  // filter names it; a seat holding it can only orchestrate tools it can
  // already see, which this list bounds)
  'workflow', 'ralph',
  // Goal & plan-mode orchestration
  'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode',
  // Background job control
  'job_output', 'job_list', 'job_kill',
  // Harness surfaces that are neither research nor reasoning
  'skill', 'ask_user_question',
]

// The intended remaining surface for council seats: read-only research tools
// for grounded evidence. Asserted against COUNCIL_DENIED_TOOLS in tests so the
// deny list can never grow over the research seats.
export const COUNCIL_KEPT_TOOLS = [
  'read', 'glob', 'grep', 'read_image', 'web_search', 'web_fetch',
]

export interface PersonaModelConfig {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * Resolve configured persona model from Settings > enpoi-orchestration.personas.
 * Returns undefined if no specific model is configured, allowing the child
 * session to naturally inherit the parent agent's model.
 */
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

/**
 * Resolve and apply configured persona model from Settings > enpoi-orchestration.personas.
 * If no specific model is configured for this persona, no request/header is appended,
 * so the child session naturally inherits the model of the parent agent that dispatched it.
 */
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
    } else {
      councilDiag(`Persona ${persona} has no override — inheriting parent model`)
    }
  } catch (err: unknown) {
    councilDiag(`applyPersonaModel warning for ${persona}: ${String(err)}`)
  }
}

/**
 * Start one continuable debater fiber (Round 1).
 * Pure reasoning invariant (I14): toolFilter denies mutation/orchestration tools.
 * Materializes the child agent directly with the persona's configured model in agentOptions.
 */
export async function startDebaterFiber(
  ctx: Context,
  parent: Agent,
  persona: string,
  systemPrompt: string,
  initialPromptText: string,
  signal: AbortSignal,
): Promise<DebaterFiberState> {
  const denied = COUNCIL_DENIED_TOOLS
  const personaModel = resolvePersonaModel(ctx, persona)

  councilDiag(`Spawning debater ${persona} with model: ${personaModel ? `${personaModel.provider}/${personaModel.model}` : `inherited from parent (${parent.options.provider}/${parent.options.model})`}`)

  const started = await ctx.subagents.startContinuable({
    provider: 'spawn',
    label: `council debater: ${persona}`,
    quiet: true,
    request: {
      prompt: [{ type: 'text', text: initialPromptText }],
      parent,
      persona: systemPrompt,
      // Duplicated from the top-level spec so the persisted descriptor keeps
      // quiet even if the top-level path regresses (spec.quiet wins at start).
      quiet: true,
      toolFilter: denied.length > 0 ? { deny: denied } : undefined,
      ...personaModel !== undefined ? {
        agentOptions: {
          provider: personaModel.provider,
          model: personaModel.model,
        },
      } : {},
    },
    signal,
  })

  if (!started.childId || started.childId === 'null' || !started.childId.includes('-')) {
    throw new Error(`council debater spawn returned an invalid child id for ${persona}: ${String(started.childId)}`)
  }

  // Record custom request/header in child session log for audit/transcripts
  applyPersonaModel(ctx, started.childId, persona)

  return {
    persona,
    childId: started.childId,
    isOffline: false,
    lastTurnSeq: 0,
    totalTokens: 0,
  }
}

/**
 * Execute follow-up turn on an existing debater fiber (Round 2+).
 */
export async function followupDebaterFiber(
  ctx: Context,
  parent: Agent,
  fiber: DebaterFiberState,
  promptText: string,
  signal: AbortSignal,
  timeoutMs = 30_000,
): Promise<void> {
  // The followup acquires the child's activation lock; a stuck lock (e.g. a
  // wedged settlement watcher) would otherwise hang the whole council forever.
  // Bound it so a wedged child surfaces as a loud error instead of a silent
  // multi-minute stall.
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
          reject(new Error(`council followup to ${fiber.persona} (${fiber.childId}) timed out after ${timeoutMs}ms — child activation lock stuck`))
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
 * Poll a child session until its turn settles and return the text.
 * Detects model errors (429, timeouts, network failures) immediately from turn/end
 * events without waiting out the full timeout.
 */
export async function waitForFiberTurn(
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
      if (Date.now() - started > timeoutMs) throw new Error(`council debater timed out after ${timeoutMs}ms`)

      // Child unmounts/parks when turn completes
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
            if (extracted.length > 0) {
              return extracted
            }
          }

          // If no assistant message was produced, inspect turn/end for provider/model errors
          const turnEnd = events.find(e => e.type === 'turn/end' && e.seq > since)
          if (turnEnd !== undefined) {
            const reason = (turnEnd.data as { reason?: { kind?: string; error?: { message?: string }; failure?: { message?: string }; reason?: { kind?: string } } })?.reason
            if (reason?.kind === 'error') {
              const errMsg = reason.error?.message ?? reason.failure?.message ?? 'Model execution failed'
              throw new Error(`Turn failed: ${errMsg}`)
            }
            if (reason?.kind === 'aborted') {
              const abortCause = reason.reason?.kind ?? 'cancelled'
              throw new Error(`Turn was aborted (${abortCause})`)
            }
            if (reason?.kind === 'completed' && messages.length === 0) {
              return '[NO_OUTPUT: debater returned empty content]'
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

/**
 * Execute one round across all active debaters in parallel with the configured retry count and quorum fraction (doc 38).
 */
export async function executeParallelRound(
  ctx: Context,
  parent: Agent,
  fibers: DebaterFiberState[],
  promptBuilder: (fiber: DebaterFiberState) => string,
  isRound1: boolean,
  systemPromptMap: Record<string, string>,
  signal: AbortSignal,
  params: { quorumFraction: number; debaterRetryCount: number; debaterTimeoutMs: number },
): Promise<DebaterResponse[]> {
  const activeFibers = fibers.filter(f => !f.isOffline)

  const tasks = activeFibers.map(async (fiber): Promise<DebaterResponse> => {
    const prompt = promptBuilder(fiber)
    let attempt = 0
    let lastError: Error | null = null

    const maxAttempts = 1 + Math.max(0, Math.min(3, params.debaterRetryCount))
    while (attempt < maxAttempts) {
      attempt++
      try {
        if (isRound1) {
          councilDiag(`[round 1] starting fiber for ${fiber.persona}`)
          const sysPrompt = systemPromptMap[fiber.persona] ?? ''
          const newFiber = await startDebaterFiber(ctx, parent, fiber.persona, sysPrompt, prompt, signal)
          fiber.childId = newFiber.childId
          councilDiag(`[round 1] started fiber for ${fiber.persona} -> childId=${fiber.childId}`)
        } else {
          councilDiag(`[round >1] follow-up for ${fiber.persona} -> childId=${fiber.childId}`)
          await followupDebaterFiber(ctx, parent, fiber, prompt, signal)
        }

        councilDiag(`waiting for turn on ${fiber.persona} (${fiber.childId})...`)
        const text = await waitForFiberTurn(ctx, fiber.childId, signal, params.debaterTimeoutMs)
        councilDiag(`turn complete on ${fiber.persona} (${fiber.childId}) -> text len ${text.length}`)
        const tokens = estimateTokens(text)
        fiber.totalTokens += tokens

        const isConcur = /^\s*CONCUR\s*$/i.test(text) || text.trim() === 'CONCUR'

        return {
          persona: fiber.persona,
          childId: fiber.childId,
          text,
          tokens,
          isConcur,
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        councilDiag(`ERROR on ${fiber.persona} attempt ${attempt}: ${lastError.stack || lastError.message}`)
        if (signal.aborted) throw lastError
        if (attempt >= maxAttempts) break
        // Brief backoff before the next retry
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // Debater failed after 2 attempts -> mark offline
    fiber.isOffline = true
    return {
      persona: fiber.persona,
      childId: fiber.childId,
      text: `[DEBATER ERROR: ${fiber.persona} failed: ${lastError?.message ?? 'deliberation failed'}]`,
      tokens: 0,
      isConcur: false,
      error: lastError?.message ?? 'deliberation failed',
    }
  })

  const results = await Promise.allSettled(tasks)
  const responses: DebaterResponse[] = []
  let onlineCount = 0

  for (const r of results) {
    if (r.status === 'fulfilled') {
      responses.push(r.value)
      if (!r.value.error) onlineCount++
    } else {
      responses.push({
        persona: 'Unknown',
        childId: '',
        text: `[DEBATER ERROR: unhandled promise rejection: ${String(r.reason)}]`,
        tokens: 0,
        isConcur: false,
        error: String(r.reason),
      })
    }
  }

  // Quorum check (doc 38): require onlineCount / fibers.length >= quorumFraction
  if (fibers.length >= 3 && onlineCount / fibers.length < params.quorumFraction) {
    const errorDetails = responses.filter(r => r.error).map(r => `${r.persona}: ${r.error}`).join('; ')
    throw new Error(`Council failed quorum: only ${onlineCount}/${fibers.length} debaters responded online (required ${(params.quorumFraction * 100).toFixed(0)}%). Errors: ${errorDetails}`)
  }

  return responses
}

/**
 * Teardown / dispose all child debater fibers cleanly.
 */
export async function disposeCouncilFibers(
  ctx: Context,
  fibers: DebaterFiberState[],
): Promise<void> {
  for (const fiber of fibers) {
    if (fiber.childId) {
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
}
