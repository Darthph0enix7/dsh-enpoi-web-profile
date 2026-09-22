/**
 * enpoi-whiteboard — orchestrator-authored pinned context (doc 66 §3c,
 * doc 67 §B).
 *
 * The board lives in the shared settings namespace `enpoi-orchestration` under
 * `whiteboard` (hot-swappable + cross-device via settings sync), is authored
 * only through the four tools (`whiteboard_read`, `whiteboard_write`,
 * `whiteboard_pin`, `whiteboard_unpin`), and is injected into every assembly
 * through the runtime-context seam (`systemPrompt.context()`, a trailing
 * replace-in-place snapshot) — never the system prompt itself, so the frozen
 * prefix keeps its cache.
 *
 * Children inherit by construction: the contribution is global, so every
 * agent's assembly (parent or delegated child) renders it, and the rendered
 * header carries the board version the spawn recorded.
 *
 * Guarantees: a rendered board over the hard budget is REFUSED (never silently
 * trimmed); `path` entries are validated on write and flagged `stale` — never
 * deleted.
 *
 * @module dsh-enpoi-whiteboard
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  DEFAULT_BUDGET_TOKENS,
  WHITEBOARD_CONTEXT_NAME,
  WHITEBOARD_CONTEXT_ORDER,
  applyWrites,
  boardApplies,
  checkBudget,
  estimateTokens,
  lintPaths,
  normalizeDoc,
  renderWhiteboard,
  setPinned,
  versionLine,
  type BoardScopeFacts,
  type WhiteboardDoc,
  type WhiteboardEntry,
  type WhiteboardWriteRequest,
} from './board'

/** Cordis plugin name. */
export const name = 'enpoi-whiteboard'

/** The board's storage namespace is a shared service; tools are the write path. */
export const inject = ['tools']

export interface Config {
  /** Hard rendered-token budget (doc 67 §B); writes over it are refused. */
  budgetTokens?: number
}

export const Config = Schema.object({
  budgetTokens: Schema.number().default(DEFAULT_BUDGET_TOKENS),
})

/** Shared settings namespace (owned by enpoi-capabilities). */
const ORCH_NS = 'enpoi-orchestration'

/** The structural slice of the settings service this plugin uses. */
interface SettingsLike {
  get?: (ns: string) => { whiteboard?: unknown } | undefined
  describe?: () => Array<{ ns: string; revision?: number }>
  mutate?: (
    ns: string,
    ops: Array<{ op: 'set'; path: string[]; value: unknown }>,
    expectedRevision?: number,
  ) => Promise<unknown>
}

/** The structural slice of the tool-execution identity this plugin uses. */
interface ToolExecLike {
  agent?: {
    session?: {
      id?: string
      header?: { cwd?: string; parentSession?: string }
    }
  }
}

/** The structural slice of `systemPrompt` this plugin uses. */
interface SystemPromptLike {
  context?: (contribution: {
    name: string
    order: number
    text: string | ((assembly: { agent?: ToolExecLike['agent'] }) => string)
  }) => () => void
}

function settingsOf(ctx: Context): SettingsLike | undefined {
  try {
    return ctx.get('settings') as SettingsLike | undefined
  } catch {
    return undefined
  }
}

/**
 * Read the current board. Never throws: a missing settings service or a
 * malformed value answers the empty board, so the plugin can never break a
 * turn (doc 66 invariant 1).
 * @param ctx - owning plugin context.
 * @returns the current board.
 */
export function readWhiteboard(ctx: Context): WhiteboardDoc {
  try {
    return normalizeDoc(settingsOf(ctx)?.get?.(ORCH_NS)?.whiteboard)
  } catch {
    return normalizeDoc(undefined)
  }
}

/** The cwd a tool call resolves `path` entries against. */
function toolCwd(exec: ToolExecLike | undefined): string {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : process.cwd()
}

/** Resolve one entry's path text against a cwd (absolute entries pass through). */
function resolveEntryPath(entry: WhiteboardEntry, cwd: string): string {
  return isAbsolute(entry.text) ? entry.text : resolve(cwd, entry.text)
}

/** A write refusal surfaced to the model verbatim. */
function refusal(message: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: false, reason: 'refused', message, ...extra }
}

/** The result of one fenced board commit. */
type CommitResult =
  | { ok: true; doc: WhiteboardDoc }
  | { ok: false; message: string; tokens?: number; budget?: number }

/**
 * Read-modify-write the board under the namespace revision fence: a concurrent
 * writer (another tool call, or the operator's settings surface) is re-read and
 * the transition replayed, so a write is never silently clobbered.
 * @param ctx - owning plugin context.
 * @param config - resolved plugin config.
 * @param build - pure transition from the current board to the candidate.
 * @returns the committed board, or a refusal message.
 */
async function commitBoard(
  ctx: Context,
  config: Required<Config>,
  build: (doc: WhiteboardDoc, now: number) => { ok: true; doc: WhiteboardDoc } | { ok: false; message: string },
): Promise<CommitResult> {
  const settings = settingsOf(ctx)
  if (settings?.mutate === undefined) return { ok: false, message: 'settings service unavailable — board not written' }
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now()
    const current = readWhiteboard(ctx)
    const built = build(current, now)
    if (!built.ok) return { ok: false, message: built.message }
    const next: WhiteboardDoc = { ...built.doc, version: current.version + 1, updatedAt: now }
    const check = checkBudget(next, config.budgetTokens)
    if (!check.ok) {
      return {
        ok: false,
        message: `Over budget: the board renders ${check.tokens} tokens (budget ${check.budget}). Nothing was written.`,
        tokens: check.tokens,
        budget: check.budget,
      }
    }
    const revision = settings.describe?.().find((entry) => entry.ns === ORCH_NS)?.revision
    try {
      await settings.mutate(ORCH_NS, [{ op: 'set', path: ['whiteboard'], value: next }], revision)
      return { ok: true, doc: next }
    } catch (error) {
      lastError = error
      if ((error as { code?: string })?.code === 'SETTINGS_CONFLICT' && attempt < 2) continue
      return { ok: false, message: `board write failed: ${String(error)}` }
    }
  }
  return { ok: false, message: `board write failed after retries: ${String(lastError)}` }
}

/** The board with its paths linted against the calling session's cwd. */
function linted(doc: WhiteboardDoc, exec: ToolExecLike | undefined): WhiteboardDoc {
  const cwd = toolCwd(exec)
  return lintPaths(doc, (entry) => resolveEntryPath(entry, cwd), existsSync, Date.now()).doc
}

/** Render + numbers for one tool result. */
function boardView(doc: WhiteboardDoc, budgetTokens: number): Record<string, unknown> {
  const rendered = renderWhiteboard(doc)
  const entries = doc.entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    text: entry.text,
    pinned: entry.pinned,
    version: entry.version,
    ...(entry.stale === true ? { stale: true } : {}),
  }))
  const stale = doc.entries.filter((entry) => entry.stale === true).map((entry) => entry.id)
  return {
    ok: true,
    version: doc.version,
    scope: doc.scope,
    tokens: estimateTokens(rendered),
    budget: budgetTokens,
    entries,
    stale,
    rendered,
    versionLine: versionLine(doc),
  }
}

/** The four board tools (doc 67 §B). */
function registerTools(ctx: Context, config: Required<Config>): void {
  const tools = (ctx as unknown as { tools?: { register?: (definition: unknown) => void } }).tools
  if (tools?.register === undefined) {
    process.stderr.write('[enpoi-whiteboard] no tools service — board tools not mounted\n')
    return
  }

  tools.register({
    name: 'whiteboard_read',
    description: 'Read the pinned shared context board (orchestrator-authored core context injected into every agent). Returns entries, the rendered block, its token cost, and stale path flags.',
    parameters: { type: 'object', properties: {}, required: [] },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          version: { type: 'number' },
          scope: { type: 'string' },
          tokens: { type: 'number' },
          budget: { type: 'number' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' }, kind: { type: 'string' }, text: { type: 'string' },
                pinned: { type: 'boolean' }, version: { type: 'number' }, stale: { type: 'boolean' },
              },
              required: ['id', 'kind', 'text', 'pinned', 'version'],
            },
          },
          stale: { type: 'array', items: { type: 'string' } },
          rendered: { type: 'string' },
          versionLine: { type: 'string' },
        },
        required: ['ok', 'version', 'scope', 'tokens', 'budget', 'entries', 'stale', 'rendered', 'versionLine'],
      },
      render: (_args, value) => [{ type: 'text', text: renderWhiteboardResult(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(_args: unknown, exec: ToolExecLike) {
      return boardView(linted(readWhiteboard(ctx), exec), config.budgetTokens)
    },
  })

  tools.register({
    name: 'whiteboard_write',
    description: [
      'Author the pinned shared context board: append entries, or replace entries by id (every replace bumps the entry version).',
      'Kinds: path (project-relative path — validated on write, flagged stale when missing, never deleted), rule, fact, task.',
      'The rendered board has a HARD token budget; an over-budget write is refused and nothing changes.',
      'Keep only core context the orchestrator must not have to repeat: current docs, invariants, task state.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['append', 'replace'], description: 'append (default) adds entries; replace overwrites the entry named by replaceId' },
        scope: { type: 'string', enum: ['session', 'project', 'global'], description: 'Where the board applies (default: keep the current scope)' },
        sessionId: { type: 'string', description: 'Session id when scope=session (default: the calling session)' },
        projectId: { type: 'string', description: 'Project cwd when scope=project (default: the calling session cwd)' },
        entries: {
          type: 'array',
          description: 'Entries to write',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Stable id; required for append-with-known-id, and the old id for replace' },
              kind: { type: 'string', enum: ['path', 'rule', 'fact', 'task'] },
              text: { type: 'string', description: 'One compact line' },
              pinned: { type: 'boolean', description: 'Pinned entries sort first and are never compacted' },
            },
            required: ['kind', 'text'],
          },
        },
      },
      required: ['entries'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' }, reason: { type: 'string' }, message: { type: 'string' },
          tokens: { type: 'number' }, budget: { type: 'number' },
          version: { type: 'number' }, scope: { type: 'string' },
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
          stale: { type: 'array', items: { type: 'string' } },
          rendered: { type: 'string' }, versionLine: { type: 'string' }, note: { type: 'string' },
        },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: renderWriteResult(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args: Record<string, unknown>, exec: ToolExecLike) {
      const mode = args.mode === 'replace' ? 'replace' as const : 'append' as const
      const rawEntries: unknown = args.entries
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) return refusal('entries must be a non-empty array')
      const requests: WhiteboardWriteRequest[] = []
      for (const raw of rawEntries) {
        const row = raw as Record<string, unknown>
        const kind = row.kind
        if (kind !== 'path' && kind !== 'rule' && kind !== 'fact' && kind !== 'task') {
          return refusal(`entries[].kind must be one of path|rule|fact|task (got ${JSON.stringify(kind)})`)
        }
        requests.push({
          kind,
          text: typeof row.text === 'string' ? row.text : '',
          ...(typeof row.id === 'string' ? { id: row.id } : {}),
          ...(mode === 'replace' && typeof row.id === 'string' ? { replaceId: row.id } : {}),
          ...(row.pinned === true ? { pinned: true } : {}),
        })
      }
      // Scope facts: explicit args win; otherwise the calling session supplies
      // them, so an unqualified write authors the board that applies here.
      const facts = scopeFactsForWrite(ctx, exec, args)
      const committed = await commitBoard(ctx, config, (doc, now) => {
        const shaped: WhiteboardDoc = { ...doc, ...facts }
        const applied = applyWrites(shaped, requests, mode, now)
        if (!applied.ok) return applied
        return { ok: true, doc: linted(applied.doc, exec) }
      })
      if (!committed.ok) return refusal(committed.message, committed.tokens === undefined ? {} : { tokens: committed.tokens, budget: committed.budget })
      const stale = committed.doc.entries.filter((entry) => entry.stale === true).map((entry) => entry.id)
      return {
        ...boardView(committed.doc, config.budgetTokens),
        note: stale.length > 0 ? `${stale.length} path entry(ies) flagged stale (missing on disk) — prune or repoint them` : 'written',
      }
    },
  })

  tools.register({
    name: 'whiteboard_pin',
    description: 'Pin a whiteboard entry: pinned entries sort first and are never compacted. Pinning never rewrites the entry text.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Entry id from whiteboard_read' } },
      required: ['id'],
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, message: { type: 'string' }, version: { type: 'number' }, tokens: { type: 'number' }, budget: { type: 'number' }, entries: { type: 'array', items: { type: 'object', additionalProperties: true } }, stale: { type: 'array', items: { type: 'string' } }, rendered: { type: 'string' }, versionLine: { type: 'string' }, note: { type: 'string' } },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: renderWriteResult(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args: Record<string, unknown>, exec: ToolExecLike) {
      const id = typeof args.id === 'string' ? args.id : ''
      if (id.length === 0) return refusal('id is required')
      const committed = await commitBoard(ctx, config, (doc, now) => setPinned(doc, id, true, now))
      if (!committed.ok) return refusal(committed.message, committed.tokens === undefined ? {} : { tokens: committed.tokens, budget: committed.budget })
      return { ...boardView(linted(committed.doc, exec), config.budgetTokens), note: `pinned ${id}` }
    },
  })

  tools.register({
    name: 'whiteboard_unpin',
    description: 'Unpin a whiteboard entry. Unpinning never deletes the entry; the operator prunes explicitly.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Entry id from whiteboard_read' } },
      required: ['id'],
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ok: { type: 'boolean' }, reason: { type: 'string' }, message: { type: 'string' }, version: { type: 'number' }, tokens: { type: 'number' }, budget: { type: 'number' }, entries: { type: 'array', items: { type: 'object', additionalProperties: true } }, stale: { type: 'array', items: { type: 'string' } }, rendered: { type: 'string' }, versionLine: { type: 'string' }, note: { type: 'string' } },
        required: ['ok'],
      },
      render: (_args, value) => [{ type: 'text', text: renderWriteResult(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args: Record<string, unknown>, exec: ToolExecLike) {
      const id = typeof args.id === 'string' ? args.id : ''
      if (id.length === 0) return refusal('id is required')
      const committed = await commitBoard(ctx, config, (doc, now) => setPinned(doc, id, false, now))
      if (!committed.ok) return refusal(committed.message, committed.tokens === undefined ? {} : { tokens: committed.tokens, budget: committed.budget })
      return { ...boardView(linted(committed.doc, exec), config.budgetTokens), note: `unpinned ${id}` }
    },
  })
}

/** Resolve the scope facts one write authors the board under. */
function scopeFactsForWrite(
  ctx: Context,
  exec: ToolExecLike | undefined,
  args: Record<string, unknown>,
): Partial<WhiteboardDoc> {
  const scope = args.scope
  if (scope !== 'session' && scope !== 'project' && scope !== 'global') return {}
  if (scope === 'global') return { scope: 'global' }
  if (scope === 'project') {
    const projectId = typeof args.projectId === 'string' && args.projectId.length > 0
      ? args.projectId
      : exec?.agent?.session?.header?.cwd ?? process.cwd()
    return { scope: 'project', projectId }
  }
  const sessionId = typeof args.sessionId === 'string' && args.sessionId.length > 0
    ? args.sessionId
    : exec?.agent?.session?.id
  return typeof sessionId === 'string' && sessionId.length > 0
    ? { scope: 'session', sessionId }
    : { scope: 'session' }
}

/** Model-facing render for a successful board read. */
function renderWhiteboardResult(value: Record<string, unknown>): string {
  const entries = Array.isArray(value.entries) ? value.entries as Array<Record<string, unknown>> : []
  if (entries.length === 0) return `Whiteboard v${String(value.version)} is empty (0/${String(value.budget)} tokens).`
  const lines = entries.map((entry) => `• ${entry.pinned === true ? '📌 ' : ''}[${String(entry.kind)}] ${String(entry.text)}${entry.stale === true ? ' (stale)' : ''} — ${String(entry.id)} v${String(entry.version)}`)
  return [...lines, `— v${String(value.version)} · ${String(value.tokens)}/${String(value.budget)} tokens`].join('\n')
}

/** Model-facing render for a board mutation (or its refusal). */
function renderWriteResult(value: Record<string, unknown>): string {
  if (value.ok !== true) return String(value.message ?? 'Whiteboard write refused.')
  const stale = Array.isArray(value.stale) ? value.stale as string[] : []
  const head = `Whiteboard v${String(value.version)} — ${stale.length} stale path flag(s).`
  const rendered = typeof value.rendered === 'string' && value.rendered.length > 0 ? value.rendered : '(empty)'
  return `${head}\n${rendered}`
}

/**
 * Install the runtime-context contribution. The contribution is global by
 * construction, so every agent assembly (orchestrator, worker, delegated
 * council seat) renders the same authored truth and records the version its
 * request carried.
 */
function installInjection(ctx: Context): void {
  const systemPrompt = ctx.get('systemPrompt') as SystemPromptLike | undefined
  if (systemPrompt?.context === undefined) {
    process.stderr.write('[enpoi-whiteboard] no systemPrompt service — runtime-context injection skipped\n')
    return
  }
  const dispose = systemPrompt.context({
    name: WHITEBOARD_CONTEXT_NAME,
    order: WHITEBOARD_CONTEXT_ORDER,
    text: (assembly) => {
      try {
        const doc = readWhiteboard(ctx)
        const facts: BoardScopeFacts = {}
        const session = assembly?.agent?.session
        if (typeof session?.id === 'string') facts.sessionId = session.id
        const parent = session?.header?.parentSession
        if (typeof parent === 'string') facts.parentSessionId = parent
        const cwd = session?.header?.cwd
        if (typeof cwd === 'string') facts.projectId = cwd
        if (!boardApplies(doc, facts)) return ''
        return renderWhiteboard(doc)
      } catch {
        return ''
      }
    },
  })
  ctx.effect(() => dispose, 'enpoi-whiteboard: runtime-context injection')
}

export function apply(ctx: Context, config: Config = {}): void {
  const resolved: Required<Config> = {
    budgetTokens: typeof config.budgetTokens === 'number' && Number.isFinite(config.budgetTokens) && config.budgetTokens > 0
      ? Math.floor(config.budgetTokens)
      : DEFAULT_BUDGET_TOKENS,
  }
  registerTools(ctx, resolved)
  installInjection(ctx)
  process.stderr.write(`[enpoi-whiteboard] mounted (budget ${resolved.budgetTokens} tokens; board read lazily per assembly; runtime-context seam)\n`)
}
