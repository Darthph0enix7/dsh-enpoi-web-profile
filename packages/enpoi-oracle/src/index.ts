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
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import type { SessionPersistence } from '@deepseek-ai/dsh-session-persistence'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { getBriefService } from 'dsh-enpoi-context-keeper'

export const name = 'enpoi-oracle'

export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

const ORACLE_PERSONA = [
  'You are the Oracle — senior architectural supervisor, conceptual thinker, and deep reviewer.',
  'You reason independently and deeply: you evaluate architecture, concepts, system trade-offs, logic, race conditions, and code.',
  'You are an advisor, not a dictator: if a plan is flawed, over-engineered, or heading in the wrong direction, say so plainly.',
  'When reviewing code, inspect relevant files directly using your search/read tools as needed to understand the broader context. When reviewing concepts or plans, evaluate feasibility, modularity, and trade-offs.',
  'This is a continuing reviewer session within the active query: reuse your accumulated context and memory from prior turns.',
  'You may call request_evidence(target, question) at any point — it sends a research child (codebase explorer or web librarian) to fetch ground truth and returns a short cited fact sheet. Ask as many or as few questions as your judgment requires; use it whenever first-hand verification would sharpen your review, and ignore it entirely when you already know enough.',
  'You never write or edit files. You never paste whole files back — you summarize, explain, and cite.',
  'End every review with a VERDICT BLOCK in exactly this JSON — the orchestrator parses it mechanically, so it must be the LAST thing you output and must be valid JSON:',
  '{"approved":true|false,"concerns":["..."],"unverified":["..."],"blockers":["..."]}',
].join('\n')

/** Read-only surface for the oracle fiber. */
const ORACLE_TOOL_FILTER = {
  // Read-only review surface. Passed UNCONDITIONALLY: the fork's
  // `tools.restrict()` skips unknown deny names, while the previous
  // `.filter(name => ctx.tools.get(name) !== undefined)` guard dropped every
  // tool registered outside this plugin's context and silently left the child
  // with the full main surface (verified live: 29 tools).
  // NOTE: `run_code` is never named — the PTC presentation transport is
  // reserved and `tools.restrict()` throws when a filter names it.
  deny: [
    'oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex',
    'subagent_claude_code', 'roundtable', 'chorus',
    'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode', 'plan_mode', 'goal',
    'ralph', 'workflow', 'job_output', 'job_list', 'job_kill',
    'bash', 'edit', 'write', 'str_replace_editor', 'skill', 'ask_user_question',
    'todo_write', 'memory_save', 'memory_rescind', 'memory_confirm', 'memory_search',
    'send_message', 'interrupt_agent', 'list_agents',
  ],
}

/** Research child persona for the evidence broker (model-facing, no internals). */
const EVIDENCE_RESEARCH_PERSONA = [
  'You are a precision research assistant. You answer EXACTLY the question asked, from the codebase (read/glob/grep) or the web (web_search/web_fetch), and nothing else.',
  'Output a FACT SHEET and nothing more:',
  'CITATION: the ACTUAL file path with line number, or the exact URL you read — never a placeholder.',
  'FACTS: the answer, maximum 150 words, only what the question asked.',
  'CONFIDENCE: high | medium | low',
  'Never speculate. If the answer is not findable, its FACTS say "NOT FINDABLE" and the CITATION shows the closest place you looked.',
].join('\n')

/** Parse a fact sheet answer (markdown-tolerant). */
export function parseEvidenceSheet(text: string): { citation: string; facts: string; confidence: string } | null {
  const plain = text.replace(/\*\*/g, '')
  const rawCitation = plain.match(/CITATION\s*[:=]\s*(.+)/i)?.[1]?.trim()
  const facts = plain.match(/FACTS\s*[:=]\s*([\s\S]*?)(?:CONFIDENCE\s*[:=]|$)/i)?.[1]?.trim()
  const confidence = plain.match(/CONFIDENCE\s*[:=]\s*(high|medium|low)/i)?.[1]?.toLowerCase()
  if (!rawCitation || !facts) return null
  const placeholder = /<file:line|url\s*—|— exact>|your citation/i.test(rawCitation)
  return {
    citation: placeholder ? 'unverified (research child echoed the template)' : rawCitation,
    facts,
    confidence: placeholder ? 'low' : (confidence ?? 'medium'),
  }
}

/** External-looking targets route to the librarian, codebase targets to the explorer. */
export function isExternalEvidenceTarget(target: string): boolean {
  return /\b(web|http|npm|docs?|librar|package|registry|external|api)\b/i.test(target)
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
  /** The Living Brief package frozen at call #1 (doc 35 amendment 6). */
  brief: string | null
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

export function textOfContent(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  // Only the child's REPORT blocks reach the parent: reasoning and tool-call
  // blocks are its private deliberation, not the answer.
  return blocks
    .map(block => {
      if (typeof block !== 'object' || block === null || !('text' in block)) return ''
      const blockType = (block as { type?: unknown }).type
      return blockType === 'text' || blockType === undefined ? String((block as { text: unknown }).text) : ''
    })
    .filter(text => text.length > 0)
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

export function buildInitialPackage(
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

export interface PersonaModelConfig {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Doc 38: oracle consultation timeout — resolved fresh per call (hot-swap). */
/** Bounded wait for the demand-driven Living Brief before an oracle consultation, in ms. */
const ORACLE_BRIEF_WAIT_MS = 4_000

/**
 * Materialize the demand-driven brief without letting a slow keeper call delay
 * the consultation. The generation keeps running single-flight in the keeper,
 * so a later call consumes the fresh prose from cache.
 * @param parent - live parent agent whose session owns the brief.
 * @param signal - caller-owned cancellation.
 */
async function ensureBriefWithin(parent: Agent, signal: AbortSignal): Promise<void> {
  const brief = getBriefService()
  if (brief === undefined) return
  const pending = brief.ensureFreshBrief(parent.session, signal).catch(() => {
    // A failed brief is optional context; the deterministic package still goes.
    return null
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, ORACLE_BRIEF_WAIT_MS) })
  try {
    await Promise.race([pending.then(() => undefined), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (signal.aborted) throw signal.reason ?? new Error('aborted')
}

export function resolveOracleTimeoutMs(ctx: Context): number {
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => { parameters?: { oracle?: { timeoutMs?: number } } } } | undefined
    const v = settings?.get?.('enpoi-orchestration')?.parameters?.oracle?.timeoutMs
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.min(300_000, Math.max(30_000, v))
  } catch {
    // settings unavailable — default
  }
  return 120_000
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
  } catch {}
  return undefined
}

/** Extract the VERDICT BLOCK JSON from the oracle's final message. */
function applyPersonaModel(ctx: Context, childId: string, persona: string): void {
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
      }
    }
  } catch {}
}

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
        const persistence = ctx.get('sessionPersistence') as SessionPersistence | undefined
        if (persistence !== undefined) {
          const handle = await persistence.open(childId, 'read')
          let events: readonly SessionEvent[]
          try {
            events = (await handle.read(0, undefined)).events
          } finally {
            await handle.close()
          }
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
              return '[NO_OUTPUT: oracle returned empty content]'
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
  /** Condensed scorecards stashed at rollover (doc 35 2.4) — seed the next fiber. */
  const rolloverScorecards = new Map<string, OracleFiber['scorecard']>()
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
          background: { type: 'boolean' },
          rejected: { type: 'boolean' },
        },
        required: ['approved', 'concerns', 'unverified', 'blockers', 'summary'],
      },
      render: (_args, value) => {
        if (value.background === true || value.rejected === true) {
          return [{ type: 'text', text: value.summary }]
        }
        return [{
          type: 'text',
          text: value.approved
            ? `Oracle verdict: APPROVED${value.concerns.length > 0 ? ` (concerns: ${value.concerns.join('; ')})` : ''}`
            : `Oracle verdict: CONCERNS${value.concerns.length > 0 ? ` — ${value.concerns.join('; ')}` : ''}${value.blockers.length > 0 ? ` | blockers: ${value.blockers.join('; ')}` : ''}`,
        }]
      },
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
          summary: 'Rejected by the single-flight mutex (I7): another oracle consultation is already running for this session.',
          rejected: true,
        }
      }
      busy.add(key)
      let bg: AbortController | null = null
      let stopWatch: (() => void) | null = null
      let handedOff = false
      try {
        const lastUserSeq = lastHumanUserMessageSeq(parent.session.snapshotEvents())
        let fiber = fibers.get(key)

        // Query-bound (I13): the oracle fiber is persistent within ONE user query / task.
        // When Adam sends a new prompt (query boundary), or the child died, reset for a clean task.
        // Scorecard rollover (doc 35 amendment 6): the old fiber's scorecard
        // seeds the fresh one — 10-consultation rollover must not lose history.
        let rolloverScorecard: OracleFiber['scorecard'] | null = null
        if (fiber !== undefined && (fiber.lastParentUserSeq !== lastUserSeq || fiber.childId === null)) {
          rolloverScorecard = fiber.scorecard
          fibers.delete(key)
          fiber = undefined
        } else if (fiber === undefined && rolloverScorecards.has(key)) {
          // A prior fiber rolled over at 10 consultations — seed with its
          // condensed scorecard (doc 35 2.4). Consumed ONLY after a
          // successful spawn (Oracle D2): a transient spawn error must not
          // erase 10 consultations of verdicts.
          rolloverScorecard = rolloverScorecards.get(key)!
        }

        const fresh = fiber === undefined

        if (fresh) {
          // Demand-driven cognition: materialize the prose brief for this
          // query's first consultation (Oracle amendment 3). Bounded: a
          // hanging keeper route degrades to the deterministic brief.
          await ensureBriefWithin(parent, exec.signal)
          fiber = {
            childId: null,
            consultations: 0,
            lastParentUserSeq: lastUserSeq,
            scorecard: rolloverScorecard ?? { files: [], verdicts: [] },
            brief: readLivingBrief(ctx, parent.session),
          }
        }

        // Frozen-at-call-#1 semantics (doc 35 amendment 6): delta calls use
        // the brief captured at the query's first consultation, never a
        // newer distillation.
        const brief = fiber.brief

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
            const denied = ORACLE_TOOL_FILTER.deny
            const personaModel = resolvePersonaModel(ctx, 'oracle')
            const started = await ctx.subagents.startContinuable({
              provider: 'spawn',
              label: `oracle review: ${args.request.slice(0, 60)}`,
              quiet: true,
              request: {
                prompt,
                parent,
                persona: ORACLE_PERSONA,
                quiet: true,
                toolFilter: denied.length > 0 ? { deny: denied } : undefined,
                ...personaModel !== undefined ? {
                  agentOptions: {
                    provider: personaModel.provider,
                    model: personaModel.model,
                  },
                } : {},
              },
              signal: bg?.signal ?? exec.signal,
            })
            if (!started.childId || started.childId === 'null' || !started.childId.includes('-')) {
              throw new Error(`oracle spawn returned an invalid child id: ${String(started.childId)}`)
            }
            fiber.childId = started.childId
            applyPersonaModel(ctx, started.childId, 'oracle')
            fibers.set(key, fiber)
            // Oracle D2: consume the rollover entry only after the spawn
            // registered — a failed spawn retries from the same entry.
            if (rolloverScorecard !== null && rolloverScorecards.has(key)) {
              rolloverScorecards.delete(key)
            }
          } catch (err) {
            fibers.delete(key)
            throw err
          }
        } else {
          await queueHostSubagentPrompt(
            ctx.subagents,
            parent,
            fiber.childId!,
            prompt,
            { kind: 'user' },
            bg?.signal ?? exec.signal,
          )
        }

        if (bg !== null) {
          handedOff = true
          const childId = fiber.childId!
          void (async () => {
            try {
              const t = await waitForChildTurn(ctx, childId, bg.signal, resolveOracleTimeoutMs(ctx))
              const v = parseVerdict(t)
              fiber.consultations += 1
              fiber.scorecard.verdicts.push({ approved: v.approved, concerns: v.concerns })
              if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files)
              if (fiber.consultations >= 10) {
                // Scorecard rollover (doc 35 2.4): dispose at 10 consultations —
                // the condensed scorecard seeds the next fiber.
                rolloverScorecards.set(key, fiber.scorecard)
                fibers.delete(key)
              }
              const agent = ctx.get('agents')?.get(parent.session.id)
              if (agent !== undefined) {
                agent.inject(createUserMessage({
                  content: [{
                    type: 'text',
                    text: `📬 Oracle (background) finished — ${v.approved ? 'APPROVED' : 'CONCERNS'} (${v.concerns.length} concern(s)).\n\n${t}`,
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
            approved: false,
            concerns: [],
            unverified: [],
            blockers: [],
            summary: `Background consultation started (${childId}) — the verdict will be delivered as a message when the oracle finishes.`,
            background: true,
          }
        }

        let verdictText = ''
        try {
          verdictText = await waitForChildTurn(ctx, fiber.childId!, bg?.signal ?? exec.signal, resolveOracleTimeoutMs(ctx))
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          fibers.delete(key)
          return {
            approved: false,
            concerns: [`Oracle consultation failed: ${errMsg}`],
            unverified: [],
            blockers: [`ORACLE_MODEL_ERROR: ${errMsg}`],
            summary: `Oracle consultation failed: ${errMsg}`,
            rejected: true,
          }
        }
        const verdict = parseVerdict(verdictText)

        fiber.consultations += 1
        fiber.scorecard.verdicts.push({ approved: verdict.approved, concerns: verdict.concerns })
        if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files)

        // Scorecard rollover (doc 35 2.4): dispose at 10 consultations —
        // the condensed scorecard seeds the next fiber.
        if (fiber.consultations >= 10) {
          rolloverScorecards.set(key, fiber.scorecard)
          fibers.delete(key)
        }

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

  // ── request_evidence: the oracle's errand boy ────────────────────────────
  // A free-form research primitive. Any agent that can see it may call it any
  // number of times (or never); it spawns one research child — codebase
  // explorer or web librarian, chosen by the target — waits for a cited fact
  // sheet, returns it as the tool result, and disposes the child. The caller
  // keeps its own context pure: one distilled answer instead of raw files.
  ctx.tools.register({
    name: 'request_evidence',
    description: [
      'Fetch ground truth for one specific question: a research child inspects the codebase (or the web for external targets) and returns a short, cited fact sheet.',
      'Use it whenever first-hand verification would sharpen your work — ask as many or as few questions as you need, one per call.',
      'The answer carries an exact citation and a confidence level; "NOT FINDABLE" means the research child could not verify it.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Where to look: a module/file/area of the codebase, or a web topic (npm, docs, library, API).' },
        question: { type: 'string', description: 'The exact factual question to verify.' },
      },
      required: ['target', 'question'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean' },
          citation: { type: 'string' },
          facts: { type: 'string' },
          confidence: { type: 'string' },
        },
        required: ['found', 'citation', 'facts', 'confidence'],
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.found
          ? `FACT SHEET (${value.confidence})\nCITATION: ${value.citation}\nFACTS: ${value.facts}`
          : `NOT FINDABLE — ${value.facts}`,
      }],
    },
    async execute(args: { target: string; question: string }, exec) {
      const requester: Agent | undefined = exec.agent
      if (requester === undefined) throw new Error('request_evidence requires a calling agent')
      const target = String(args.target ?? '').trim()
      const question = String(args.question ?? '').trim()
      if (target.length === 0 || question.length === 0) {
        return { found: false, citation: 'n/a', facts: 'request_evidence requires both target and question.', confidence: 'low' }
      }
      const retrievedBy = isExternalEvidenceTarget(target) ? 'librarian' : 'explorer'
      const personaModel = resolvePersonaModel(ctx, retrievedBy)
      let childId: SessionId | null = null
      try {
        const started = await ctx.subagents.startContinuable({
          provider: 'spawn',
          label: `evidence request: ${question.slice(0, 50)}`,
          quiet: true,
          request: {
            prompt: [{ type: 'text', text: `TARGET: ${target}\nQUESTION: ${question}\n\nProduce the FACT SHEET now.` }],
            parent: requester,
            persona: EVIDENCE_RESEARCH_PERSONA,
            quiet: true,
            toolFilter: { deny: EVIDENCE_CHILD_DENY },
            ...(personaModel !== undefined ? {
              agentOptions: { provider: personaModel.provider, model: personaModel.model },
            } : {}),
          },
          signal: exec.signal,
        })
        if (!started.childId || started.childId === 'null' || !String(started.childId).includes('-')) {
          throw new Error(`evidence research child spawn returned an invalid id: ${String(started.childId)}`)
        }
        childId = started.childId as SessionId
        const text = await waitForChildTurn(ctx, childId, exec.signal, 240_000)
        const sheet = parseEvidenceSheet(text)
        if (sheet === null) {
          return { found: false, citation: 'n/a', facts: `the research child returned no parseable fact sheet; raw tail: ${text.slice(-300)}`, confidence: 'low' }
        }
        const notFindable = /NOT FINDABLE/i.test(sheet.facts)
        return { found: !notFindable, citation: sheet.citation, facts: sheet.facts, confidence: sheet.confidence }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { found: false, citation: 'n/a', facts: `evidence retrieval failed: ${msg}`, confidence: 'low' }
      } finally {
        if (childId !== null) {
          try { await ctx.get('sessions')?.delete(childId) } catch { /* best-effort disposal */ }
        }
      }
    },
  })
}

/** Anti-leak fence for evidence research children (never relay to the parent inbox). */
const EVIDENCE_CHILD_DENY = [
  'send_message', 'oracle_review', 'request_evidence', 'dispatch_task', 'subagent', 'subagent_fork',
  'subagent_codex', 'subagent_claude_code', 'roundtable', 'chorus', 'council_register',
  'bash', 'edit', 'write', 'str_replace_editor', 'todo_write', 'plan_mode', 'goal',
  'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode', 'workflow', 'ralph',
  'job_output', 'job_list', 'job_kill', 'skill', 'ask_user_question', 'memory_save',
  'memory_search', 'memory_rescind', 'memory_confirm', 'interrupt_agent', 'list_agents',
]
