/**
 * Enpoi Harness — `oracle_review` tool.
 *
 * The Oracle is Adam's senior architectural supervisor and deep reviewer: a
 * per-session continuable fiber that reviews plans, logic, and edge cases.
 * Call #1 receives the full package (Living Brief + request + reading-list
 * artifacts); calls #2+ are delta-only continuation turns, so the fiber's KV
 * prefix stays warm. Verdicts are structured text the tool parses
 * mechanically.
 *
 * Design notes (frozen in ~/dsh-migration/31-35):
 * - Blocking tool (I13-oracle: the orchestrator awaits the verdict).
 * - Per-session fiber, query-bound: a new user message resets it (I13).
 * - Scorecard rollover: after 10 consultations the fiber is disposed and a
 *   fresh one seeds with the condensed scorecard (doc 35 2.4).
 * - Single-flight mutex (I7): a parallel `[oracle_review, oracle_review]`
 *   tool batch is rejected with CONCURRENT_CALL_REJECTED.
 * - Reading-list rule: the tool passes file paths, never pasted code (OMO).
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Session, SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'enpoi-oracle'

export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

const ORACLE_PERSONA = [
  'You are the Oracle — senior architectural supervisor, conceptual thinker, and deep reviewer.',
  'You reason independently and deeply: you evaluate architecture, concepts, system trade-offs, logic, race conditions, and code.',
  'You are an advisor, not a dictator: if a plan is flawed, over-engineered, or heading in the wrong direction, say so plainly.',
  'When reviewing code, inspect relevant files directly using your search/read tools as needed to understand the broader context. When reviewing concepts or plans, evaluate feasibility, modularity, and trade-offs.',
  'This is a continuing reviewer session within the active query: reuse your accumulated context and memory from prior turns.',
  'You never write or edit files. You never paste whole files back — you summarize, explain, and cite.',
  'End every review with a VERDICT BLOCK in exactly this JSON — the orchestrator parses it mechanically, so it must be the LAST thing you output and must be valid JSON:',
  '{"approved":true|false,"concerns":["..."],"unverified":["..."],"blockers":["..."]}',
].join('\n')

/** Read-only surface for the oracle fiber. */
const ORACLE_TOOL_FILTER = {
  deny: [
    'oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex',
    'subagent_claude_code', 'bash', 'edit', 'write', 'str_replace_editor',
    'todo_write', 'plan_mode', 'goal',
  ],
}

interface Verdict {
  approved: boolean
  concerns: string[]
  unverified: string[]
  blockers: string[]
}

interface OracleFiber {
  childId: SessionId | null
  consultations: number
  lastParentUserSeq: number
  scorecard: { files: string[]; verdicts: Array<{ approved: boolean; concerns: string[] }> }
}

function lastHumanUserMessageSeq(events: readonly SessionEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e?.type === 'user/message') {
      const src = (e.data as { source?: { kind?: string } })?.source
      if (src?.kind === 'user') return e.seq
    }
  }
  return 0
}

function textOfContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map(block => typeof block === 'object' && block !== null && 'text' in block
      ? String((block as { text: unknown }).text)
      : '')
    .join(' ')
}

/** Read the Living Brief projection snapshot for the caller's session. */
function readLivingBrief(ctx: Context, session: Session): string | null {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections === undefined) return null
    const snapshot = projections.snapshot(session)
    const view = snapshot.values?.livingBrief
    if (view === undefined || view === null) return null
    const prose = typeof view.prose === 'object' && view.prose !== null ? view.prose : null
    const freshness = typeof view.freshness === 'string' ? view.freshness : 'stale'
    const parts = [
      view.goal !== undefined && view.goal !== '' ? `Goal: ${String(view.goal)}` : null,
      Array.isArray(view.decisions) && view.decisions.length > 0
        ? `Decisions: ${view.decisions.map((d: { text: string }) => d.text).join('; ')}` : null,
      Array.isArray(view.openThreads) && view.openThreads.length > 0
        ? `Open threads: ${view.openThreads.map((t: { text: string }) => t.text).join('; ')}` : null,
      prose !== null ? `Keeper synthesis: ${String((prose as { text: string }).text)}` : null,
      `Brief freshness: ${freshness}`,
    ].filter((p): p is string => p !== null)
    return parts.length > 0 ? parts.join('\n') : null
  } catch {
    return null
  }
}

function buildInitialPackage(
  brief: string | null,
  args: { request: string; files?: string[] },
  scorecard: OracleFiber['scorecard'],
): string {
  const lines: string[] = []
  lines.push('You are the Oracle — the senior architectural supervisor and deep reviewer.')
  lines.push('This is a FRESH consultation session for the active user query. Review the request below against the current state.')
  if (brief !== null) {
    lines.push('--- SESSION BRIEF ---')
    lines.push(brief)
  }
  if (scorecard.verdicts.length > 0) {
    lines.push('--- PRIOR REVIEWS IN RECENT SESSIONS (condensed scorecard) ---')
    for (const v of scorecard.verdicts.slice(-3)) {
      lines.push(`- ${v.approved ? 'approved' : 'concerns'}: ${v.concerns.join('; ') || 'no concerns noted'}`)
    }
  }
  lines.push('--- REVIEW REQUEST ---')
  lines.push(args.request)
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push('--- READING LIST (read these files directly) ---')
    for (const f of args.files) lines.push(`- ${f}`)
  }
  return lines.join('\n')
}

function buildDelta(brief: string | null, args: { request: string; files?: string[] }): string {
  const lines: string[] = ['Follow-up review in the SAME query (delta turn). Your prior review and findings are in your conversation history above.']
  if (brief !== null) {
    lines.push('--- CURRENT SESSION BRIEF ---', brief)
  }
  lines.push('--- DELTA REQUEST ---', args.request)
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push('--- CHANGED/NEW FILES TO READ ---')
    for (const f of args.files) lines.push(`- ${f}`)
  }
  return lines.join('\n')
}

/** Extract the VERDICT BLOCK JSON from the oracle's final message. */
function parseVerdict(text: string): Verdict {
  // 1) Strict JSON block first.
  const matches = [...text.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)]
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i]![0]
    try {
      const parsed = JSON.parse(candidate) as Partial<Verdict>
      if (typeof parsed.approved === 'boolean') {
        return {
          approved: parsed.approved,
          concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
          unverified: Array.isArray(parsed.unverified) ? parsed.unverified.map(String) : [],
          blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(String) : [],
        }
      }
    } catch {
      /* keep scanning older candidates */
    }
  }
  // 2) Heuristic fallback: the oracle reliably states an approval verdict in
  // prose. Approved = an unnegated "approved" statement.
  const approved = /\bapproved\b/i.test(text) && !/not\s+approved|rejected|denied/i.test(text)
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20)
  const concerns = sentences.filter(s => /concern|risk|warning|must|should|edge case|careful/i.test(s)).slice(0, 6)
  const blockers = sentences.filter(s => /blocker|blocked|prevent|fails? closed|cannot|incompatible/i.test(s)).slice(0, 4)
  return { approved, concerns, unverified: [], blockers }
}

async function waitForChildTurn(ctx: Context, childId: SessionId, signal: AbortSignal, timeoutMs = 120_000): Promise<string> {
  const started = Date.now()
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) throw new Error('oracle consultation aborted')
      if (Date.now() - started > timeoutMs) throw new Error(`oracle consultation timed out after ${timeoutMs}ms`)
      // The child parks when its turn settles (cold-resume model, Spike A).
      if (ctx.agents.get(childId) === undefined) {
        const persistence = ctx.get('sessionPersistence')
        if (persistence !== undefined) {
          const loaded = await persistence.load(childId)
          const events = loaded.events as SessionEvent[]
          // Slice to the CURRENT turn: only assistant messages after the last
          // user message (delta followups must not re-read older verdicts).
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

export function apply(ctx: Context): void {
  ctx.inject(['tools', 'subagents', 'sessionPersistence', 'sessions'], (injected) => {
    registerOracleTools(injected, ctx)
  })
}

function registerOracleTools(ctx: Context, root: Context): void {
  ctx = root
  const fibers = new Map<string, OracleFiber>()
  const busy = new Set<string>()

  ctx.tools.register({
    name: 'oracle_review',
    description: [
      'Consult the Oracle (senior reviewer for architecture, conceptual design, planning, trade-offs, code reviews, and debugging).',
      'The Oracle reasons independently about concepts and code. LIFECYCLE: Starts fresh on each new user query, but stays persistent across follow-up calls within that query.',
      'Call #1 of a query: provide self-contained context (what you are building/fixing, architecture, decisions) and any relevant file paths if applicable. On follow-ups: send concise deltas.',
      'Blocking by default; background:true delivers verdict as a message.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description: 'What to review or consult on. On Call #1 of a query, provide clear self-contained context (concepts, problem, approach, state). On follow-ups in the same query, provide a concise delta.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of relevant file paths if reviewing concrete code. Omit for purely conceptual, architectural, or strategic reviews.',
        },
        background: {
          type: 'boolean',
          description: 'Run in the background — returns immediately; the verdict arrives as a delivered message. Omit for blocking.',
        },
      },
      required: ['request'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          approved: { type: 'boolean' },
          concerns: { type: 'array', items: { type: 'string' } },
          unverified: { type: 'array', items: { type: 'string' } },
          blockers: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['approved', 'concerns', 'unverified', 'blockers', 'summary'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.approved
          ? `Oracle verdict: APPROVED${value.concerns.length > 0 ? ` (concerns: ${value.concerns.join('; ')})` : ''}`
          : `Oracle verdict: CONCERNS${value.concerns.length > 0 ? ` — ${value.concerns.join('; ')}` : ''}${value.blockers.length > 0 ? ` | blockers: ${value.blockers.join('; ')}` : ''}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('oracle_review requires a calling agent')

      const key = parent.session.id
      if (busy.has(key)) {
        return {
          approved: false,
          concerns: [],
          unverified: [],
          blockers: ['CONCURRENT_CALL_REJECTED: another oracle consultation is already running for this session'],
          summary: 'Rejected by the single-flight mutex (I7).',
        }
      }
      busy.add(key)
      let bg: AbortController | null = null
      let stopWatch: (() => void) | null = null
      let handedOff = false
      try {
        const lastUserSeq = lastHumanUserMessageSeq(parent.session.events)
        let fiber = fibers.get(key)

        // Query-bound (I13): the oracle fiber is persistent within ONE user query / task.
        // When Adam sends a new prompt (query boundary), or the child died, reset for a clean task.
        if (fiber !== undefined && (fiber.lastParentUserSeq !== lastUserSeq || fiber.childId === null)) {
          fibers.delete(key)
          fiber = undefined
        }

        const brief = readLivingBrief(ctx, parent.session)
        const fresh = fiber === undefined

        if (fresh) {
          fiber = {
            childId: null,
            consultations: 0,
            lastParentUserSeq: lastUserSeq,
            scorecard: { files: [], verdicts: [] },
          }
        }

        if (args.background === true) {
          bg = new AbortController()
          stopWatch = ctx.on('session/event', (s, e: SessionEvent) => {
            if (s.id !== parent.session.id) return
            if (e.type === 'turn/end' && e.data.reason.kind === 'aborted' && e.data.reason.reason?.kind === 'user') bg?.abort()
          })
        }

        const prompt: Array<{ type: 'text'; text: string }> = [{
          type: 'text',
          text: fresh
            ? buildInitialPackage(brief, args, fiber.scorecard)
            : buildDelta(brief, args),
        }]

        if (fresh) {
          try {
            const denied = ORACLE_TOOL_FILTER.deny.filter(name => ctx.tools.get(name) !== undefined)
            const started = await ctx.subagents.startContinuable({
              provider: 'spawn',
              label: `oracle review: ${args.request.slice(0, 60)}`,
              request: {
                prompt,
                parent,
                persona: ORACLE_PERSONA,
                toolFilter: denied.length > 0 ? { deny: denied } : undefined,
              },
              signal: bg?.signal ?? exec.signal,
            })
            if (!started.childId || started.childId === 'null' || !started.childId.includes('-')) {
              throw new Error(`oracle spawn returned an invalid child id: ${String(started.childId)}`)
            }
            fiber.childId = started.childId
            fibers.set(key, fiber)
          } catch (err) {
            fibers.delete(key)
            throw err
          }
        } else {
          await ctx.subagents.followup(parent, fiber.childId!, prompt, {
            source: { kind: 'user' },
            signal: bg?.signal ?? exec.signal,
          })
        }

        if (bg !== null) {
          handedOff = true
          const childId = fiber.childId!
          void (async () => {
            try {
              const t = await waitForChildTurn(ctx, childId, bg.signal)
              const v = parseVerdict(t)
              fiber.consultations += 1
              fiber.scorecard.verdicts.push({ approved: v.approved, concerns: v.concerns })
              if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files)
              if (fiber.consultations >= 10) fibers.delete(key)
              try {
                parent.session.append('oracle/verdict-committed', { childId, approved: v.approved, concernCount: v.concerns.length })
              } catch { /* best-effort event */ }
              const agent = ctx.get('agents')?.get(parent.session.id)
              if (agent !== undefined) {
                agent.inject(createUserMessage({
                  content: [{
                    type: 'text',
                    text: `📬 Oracle (background) finished — ${v.approved ? 'APPROVED' : 'CONCERNS'} (${v.concerns.length} concern(s)).\n${t.slice(0, 500)}`,
                  }],
                  source: { kind: 'plugin', plugin: 'enpoi-oracle' },
                }))
              }
            } catch { /* aborted or failed: no delivery */ } finally {
              stopWatch?.()
              busy.delete(key)
            }
          })()
          return {
            taskId: childId,
            status: 'running',
            note: 'Background consultation started — the verdict will be delivered as a message when the oracle finishes.',
          }
        }

        const verdictText = await waitForChildTurn(ctx, fiber.childId!, bg?.signal ?? exec.signal)
        const verdict = parseVerdict(verdictText)

        fiber.consultations += 1
        fiber.scorecard.verdicts.push({ approved: verdict.approved, concerns: verdict.concerns })
        if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files)

        // Scorecard rollover (doc 35 2.4): dispose at 10 consultations.
        if (fiber.consultations >= 10) {
          fibers.delete(key)
        }

        // Emit the contract event (doc 33 §4.2).
        try {
          parent.session.append('oracle/verdict-committed', {
            childId: fiber.childId!,
            approved: verdict.approved,
            concernCount: verdict.concerns.length,
          })
        } catch { /* best-effort event */ }

        return {
          approved: verdict.approved,
          concerns: verdict.concerns,
          unverified: verdict.unverified,
          blockers: verdict.blockers,
          summary: verdictText,
        }
      } finally {
        if (!handedOff) {
          stopWatch?.()
          busy.delete(key)
        }
      }
    },
  })
}
