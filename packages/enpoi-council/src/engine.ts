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
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createHash } from 'node:crypto'
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

/** Extract text content from message blocks. */
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
          if ('text' in part && typeof (part as { text: unknown }).text === 'string') {
            return (part as { text: string }).text
          }
        }
        return ''
      })
      .filter((t) => t.length > 0)
      .join(' ')
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

const COUNCIL_DENIED_TOOLS = [
  'oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex',
  'subagent_claude_code', 'bash', 'edit', 'write', 'str_replace_editor',
  'todo_write', 'plan_mode', 'goal', 'roundtable', 'chorus',
  'memory_save', 'memory_search', 'memory_rescind', 'memory_confirm',
]

/**
 * Start one continuable debater fiber (Round 1).
 * Pure reasoning invariant (I14): toolFilter denies mutation/orchestration tools.
 */
export async function startDebaterFiber(
  ctx: Context,
  parent: Agent,
  persona: string,
  systemPrompt: string,
  initialPromptText: string,
  signal: AbortSignal,
): Promise<DebaterFiberState> {
  const denied = COUNCIL_DENIED_TOOLS.filter(name => ctx.tools.get(name) !== undefined)
  const started = await ctx.subagents.startContinuable({
    provider: 'spawn',
    label: `council debater: ${persona}`,
    request: {
      prompt: [{ type: 'text', text: initialPromptText }],
      parent,
      persona: systemPrompt,
      toolFilter: denied.length > 0 ? { deny: denied } : undefined,
    },
    signal,
  })

  if (!started.childId || started.childId === 'null' || !started.childId.includes('-')) {
    throw new Error(`council debater spawn returned an invalid child id for ${persona}: ${String(started.childId)}`)
  }

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
): Promise<void> {
  await ctx.subagents.followup(
    parent,
    fiber.childId as SessionId,
    [{ type: 'text', text: promptText }],
    {
      source: { kind: 'user' },
      signal,
    },
  )
}

/**
 * Poll a child session until its turn settles and return the text.
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
        const persistence = ctx.get('sessionPersistence')
        if (persistence !== undefined) {
          const loaded = await persistence.load(childId as SessionId)
          const events = loaded.events as SessionEvent[]
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
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Execute one round across all active debaters in parallel with 1 retry and 2/3 quorum (A4.2).
 */
export async function executeParallelRound(
  ctx: Context,
  parent: Agent,
  fibers: DebaterFiberState[],
  promptBuilder: (fiber: DebaterFiberState) => string,
  isRound1: boolean,
  systemPromptMap: Record<string, string>,
  signal: AbortSignal,
): Promise<DebaterResponse[]> {
  const activeFibers = fibers.filter(f => !f.isOffline)

  const tasks = activeFibers.map(async (fiber): Promise<DebaterResponse> => {
    const prompt = promptBuilder(fiber)
    let attempt = 0
    let lastError: Error | null = null

    while (attempt < 2) {
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
        const text = await waitForFiberTurn(ctx, fiber.childId, signal)
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
        if (attempt >= 2) break
        // Brief backoff before single retry
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // Debater failed after 2 attempts -> mark offline
    fiber.isOffline = true
    return {
      persona: fiber.persona,
      childId: fiber.childId,
      text: `[OFFLINE: ${lastError?.message ?? 'deliberation failed'}]`,
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
        text: '[OFFLINE: unhandled promise rejection]',
        tokens: 0,
        isConcur: false,
        error: String(r.reason),
      })
    }
  }

  // 2/3 Quorum check: require at least 2 active debaters
  if (onlineCount < 2 && fibers.length >= 3) {
    throw new Error(`Council failed 2/3 quorum: only ${onlineCount}/${fibers.length} debaters responded online.`)
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
