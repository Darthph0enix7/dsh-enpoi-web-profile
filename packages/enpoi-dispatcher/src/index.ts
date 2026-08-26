/**
 * Enpoi Harness — `dispatch_task` tool (Two-Door Dispatcher, Door 2).
 *
 * Spawns a bounded worker fiber (one-shot, blocking) with a strict Task Card:
 * objective + scope + constraints + files, plus the session's Living Brief
 * (with a soft freshness gate). Worker personas are ported from the OpenCode
 * OMO orchestration system; tool surfaces are filtered per role.
 *
 * Design notes (frozen in ~/dsh-migration/31-35):
 * - Never a raw transcript: the worker gets the Task Card + brief only.
 * - File locks: two workers can never edit the same file concurrently
 *   (doc 35 12.3) — conflicts return FILE_LOCK_HELD.
 * - Structured SubagentReturn via outputSchema (the worker's structured
 *   runtime commits `{changed, verified, NOT_verified, provenance}`).
 * - Soft freshness gate: stale prose → `[PROSE UNVERIFIED]` tag, never refuse.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { openMemoryDb } from '../../enpoi-memory/src/db'
import { makePipeline } from '../../enpoi-memory/src/pipeline'
import type { Agent } from '@deepseek-ai/dsh-agent'

export const name = 'enpoi-dispatcher'

export const inject = ['tools', 'subagents']

/** Ported from OpenCode OMO agent descriptions. */
const PERSONAS: Record<string, string> = {
  fixer: [
    'You are a Fixer — a bounded parallel implementation worker.',
    'You execute EXACTLY the task card given. You do not redesign, you do not scope-creep.',
    'You may read and edit files, but ONLY within the scope and constraints listed.',
    'While implementing, note any bugs, race conditions, or edge cases you notice and report them.',
    'Finish with the required structured return: files changed, verified status, facts to remember.',
  ].join('\n'),
  explorer: [
    'You are an Explorer — a codebase mapper and file discoverer.',
    'Your lane: comprehensive understanding of where things are before planning.',
    'You read and search; you NEVER edit files.',
    'Report findings as a concise map: locations, symbols, patterns, references.',
  ].join('\n'),
  librarian: [
    'You are a Librarian — an exhaustive external researcher.',
    'Your lane: libraries, best practices, APIs, bugs, external context.',
    'Use web research and file reads; you NEVER edit files.',
    'Return the truth with sources, not opinions.',
  ].join('\n'),
  designer: [
    'You are a Designer — UI/UX execution.',
    'Your lane: user-facing interfaces, responsive layouts, visual consistency, styling.',
    'Follow the existing design system and the task-card constraints strictly.',
    'You may read and edit UI files only. Report what you changed.',
  ].join('\n'),
}

/** Tool-surface gating per role (I14). Mutations + orchestration removed for research roles. */
/** True if the parent session's last turn ended aborted+user (I11 CAS gate). */
function parentAborted(session: Session): boolean {
  const events = session.events
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== 'turn/end') continue
    const reason = (e.data as { reason: { kind: string; reason?: { kind?: string } } }).reason
    return reason.kind === 'aborted' && reason.reason?.kind === 'user'
  }
  return false
}

/** File observed `remember_later` claims through the CBDC pipe (trust by verified flag). */
async function intakeWorkerClaims(
  worker: string,
  session: Session,
  structured: { remember_later?: string[] } | undefined,
  verified: boolean,
  provenance: string,
): Promise<void> {
  const remember = Array.isArray(structured?.remember_later) ? structured!.remember_later! : []
  if (remember.length === 0) return
  try {
    const db = openMemoryDb()
    const mem = makePipeline(db)
    await mem.intake(
      remember.map(f => ({ fact: String(f).slice(0, 400), category: 'PROJECT' })),
      {
        origin: `worker:${worker}`,
        trust: verified ? 'verified_execution' : 'untrusted_external',
        parentAborted: parentAborted(session),
        provenance,
      },
    )
  } catch { /* best-effort: memory failure never breaks the worker result */ }
}

const TOOL_FILTERS: Record<string, { deny: string[] }> = {
  fixer: { deny: ['oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code'] },
  explorer: { deny: ['oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'bash', 'edit', 'write', 'str_replace_editor', 'todo_write', 'plan_mode', 'goal'] },
  librarian: { deny: ['oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'bash', 'edit', 'write', 'str_replace_editor', 'todo_write', 'plan_mode', 'goal'] },
  designer: { deny: ['oracle_review', 'dispatch_task', 'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code'] },
}

const SUBAGENT_RETURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    changed: { type: 'array', items: { type: 'string' } },
    verified: { type: 'boolean' },
    NOT_verified: { type: 'array', items: { type: 'string' } },
    remember_later: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['changed', 'verified', 'NOT_verified', 'remember_later', 'summary'],
}

function readLivingBrief(ctx: Context, session: Session): string | null {
  try {
    const projections = ctx.get('sessionProjections')
    if (projections === undefined) return null
    const view = projections.snapshot(session).values?.livingBrief
    if (view === undefined || view === null) return null
    const prose = typeof view.prose === 'object' && view.prose !== null ? view.prose : null
    const freshness = typeof view.freshness === 'string' ? view.freshness : 'stale'
    const parts = [
      view.goal !== undefined && view.goal !== '' ? `Goal: ${String(view.goal)}` : null,
      Array.isArray(view.decisions) && view.decisions.length > 0
        ? `Decisions: ${view.decisions.map((d: { text: string }) => d.text).join('; ')}` : null,
      prose !== null ? `Keeper synthesis: ${String((prose as { text: string }).text)}` : null,
      `Brief freshness: ${freshness}`,
    ].filter((p): p is string => p !== null)
    return parts.length > 0 ? parts.join('\n') : null
  } catch {
    return null
  }
}

function buildTaskCard(
  worker: string,
  args: { objective: string; scope?: string; constraints?: string; files?: string[] },
  brief: string | null,
): string {
  const lines: string[] = ['--- TASK CARD ---']
  lines.push(`Worker role: ${worker}`)
  lines.push(`Objective: ${args.objective}`)
  if (args.scope !== undefined && args.scope !== '') lines.push(`Scope: ${args.scope}`)
  if (args.constraints !== undefined && args.constraints !== '') lines.push(`Constraints: ${args.constraints}`)
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push('Files:')
    for (const f of args.files) lines.push(`- ${f}`)
  }
  if (brief !== null) {
    const flagged = brief.includes('Brief freshness: stale') || brief.includes('Brief freshness: cooling')
      ? '\n[PROSE UNVERIFIED] The session brief prose may be stale — rely on the deterministic fields and the task card above.' : ''
    lines.push('--- SESSION BRIEF ---')
    lines.push(brief + flagged)
  }
  lines.push('--- RETURN CONTRACT ---')
  lines.push('Finish by filling the structured return: changed (files you modified), verified (true if you verified your work), NOT_verified (changed files you could not verify), remember_later (facts worth remembering).')
  return lines.join('\n')
}

export function apply(ctx: Context): void {
  ctx.inject(['tools', 'subagents'], (injected) => {
    registerDispatcher(injected)
  })
}

function registerDispatcher(ctx: Context): void {
  ctx = ctx.root
  const fileLocks = new Map<string, string>()
  const definition = {
    name: 'dispatch_task',
    description: [
      'Dispatch a bounded worker subagent with a strict Task Card. Workers: fixer (parallel bounded implementation),',
      'explorer (codebase mapping), librarian (external research), designer (UI/UX execution).',
      'The worker gets ONLY the task card + session brief — never the raw conversation.',
      'Pass exact file paths; the dispatcher locks them against concurrent workers. Blocking by default;',
      'set background:true to keep working — the result is then delivered to you as a message.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        worker: { type: 'string', enum: ['fixer', 'explorer', 'librarian', 'designer'], description: 'Worker role: fixer (bounded implementation), explorer (codebase mapping/research), librarian (external/web research), designer (UI)' },
        objective: { type: 'string', description: 'The precise thing to do — self-contained' },
        scope: { type: 'string', description: 'What is in bounds (directories, files, subsystems)' },
        constraints: { type: 'string', description: 'Hard rules: do not touch X, follow Y, no redesign' },
        files: { type: 'array', items: { type: 'string' }, description: 'Exact file paths the worker may need (locked against other workers)' },
        background: { type: 'boolean', description: 'Run in the background — returns immediately; the result arrives as a delivered message. Omit for blocking.' },
      },
      required: ['worker', 'objective'],
    },
    output: {
      schema: SUBAGENT_RETURN_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: value.verified
          ? `Worker done — changed: ${(value.changed ?? []).join(', ') || 'none'}`
          : `Worker done (unverified) — changed: ${(value.changed ?? []).join(', ') || 'none'}; NOT verified: ${(value.NOT_verified ?? []).join(', ') || 'none'}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent: Agent | undefined = exec.agent
      if (parent === undefined) throw new Error('dispatch_task requires a calling agent')
      if (!(args.worker in PERSONAS)) {
        return { changed: [], verified: false, NOT_verified: [], remember_later: [], summary: `Unknown worker '${args.worker}'` }
      }

      // File locks (doc 35 12.3).
      const targetFiles: string[] = Array.isArray(args.files) ? args.files : []
      const held = targetFiles.filter(f => fileLocks.has(f))
      if (held.length > 0) {
        return {
          changed: [], verified: false, NOT_verified: [], remember_later: [],
          summary: `FILE_LOCK_HELD: ${held.join(', ')} (locked by another worker; wait or pick different files)`,
        }
      }
      for (const f of targetFiles) fileLocks.set(f, parent.session.id)
      let bg: AbortController | null = null
      let stopWatch: (() => void) | null = null
      let handedOff = false
      const releaseLocks = () => {
        for (const f of targetFiles) fileLocks.delete(f)
      }

      try {
        const brief = readLivingBrief(ctx, parent.session)
        const taskCard = buildTaskCard(args.worker, args, brief)
        const rawFilter = TOOL_FILTERS[args.worker]
        const denied = rawFilter?.deny?.filter(name => ctx.tools.get(name) !== undefined)
        const toolFilter = denied && denied.length > 0 ? { deny: denied } : undefined
        const persona = PERSONAS[args.worker]!

        if (args.background === true) {
          bg = new AbortController()
          stopWatch = ctx.on('session/event', (s, e: SessionEvent) => {
            if (s.id !== parent.session.id) return
            if (e.type === 'turn/end' && e.data.reason.kind === 'aborted' && e.data.reason.reason?.kind === 'user') bg?.abort()
          })
        }
        const run = await ctx.subagents.start('spawn', {
          label: `${args.worker}: ${args.objective.slice(0, 60)}`,
          prompt: [{ type: 'text', text: taskCard }],
          parent,
          persona,
          toolFilter,
          outputSchema: SUBAGENT_RETURN_SCHEMA,
          signal: bg?.signal ?? exec.signal,
        })
        if (bg !== null) {
          handedOff = true
          void (async () => {
            try {
              const result = await run.result
              const structured = result.structured as
                | { changed?: string[]; verified?: boolean; NOT_verified?: string[]; remember_later?: string[]; summary?: string }
                | undefined
              const agent = ctx.get('agents')?.get(parent.session.id)
              if (agent !== undefined) {
                agent.inject(createUserMessage({
                  content: [{
                    type: 'text',
                    text: `📬 Worker '${args.worker}' (background) finished — ${structured?.verified ? 'verified' : 'unverified'} — changed: ${(structured?.changed ?? []).join(', ') || 'none'}.\n${(structured?.summary ?? result.text ?? '').slice(0, 500)}`,
                  }],
                  source: { kind: 'plugin', plugin: 'enpoi-dispatcher' },
                }))
              }
              await intakeWorkerClaims(args.worker, parent.session, structured, structured?.verified === true,
                JSON.stringify({ parentSessionId: parent.session.id, background: true }))
            } catch { /* aborted or failed: no delivery */ } finally {
              stopWatch?.()
              releaseLocks()
            }
          })()
          return {
            changed: [], verified: false, NOT_verified: [], remember_later: [],
            summary: `Background ${args.worker} started — the result will be delivered as a message when it finishes.`,
          }
        }
        const result = await run.result
        const structured = result.structured as
          | { changed?: string[]; verified?: boolean; NOT_verified?: string[]; remember_later?: string[]; summary?: string }
          | undefined
        await intakeWorkerClaims(args.worker, parent.session, structured, structured?.verified === true,
          JSON.stringify({ parentSessionId: parent.session.id }))
        return {
          changed: structured?.changed ?? [],
          verified: structured?.verified ?? false,
          NOT_verified: structured?.NOT_verified ?? [],
          remember_later: structured?.remember_later ?? [],
          summary: structured?.summary ?? result.text ?? 'worker finished',
        }
      } finally {
        if (!handedOff) {
          stopWatch?.()
          releaseLocks()
        }
      }
    },
  }
  ctx.tools.register(definition)
}
