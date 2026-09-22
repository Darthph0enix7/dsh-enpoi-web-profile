/**
 * enpoi-whiteboard — pinned-board vocabulary: normalization, rendering, the
 * hard token budget, and the path/staleness lint. Pure functions only; the
 * settings transport, tools and runtime-context injection live in ./index.ts.
 *
 * Storage contract (doc 66 §3c, doc 67 §B): `enpoi-orchestration.whiteboard`
 * holds `{ version, scope, entries }`. Every entry carries a version; path
 * entries are validated on write and flagged stale — never auto-deleted.
 *
 * @module dsh-enpoi-whiteboard/board
 */

/** Where a board applies; resolution prefers session over project over global. */
export type WhiteboardScope = 'session' | 'project' | 'global'

/** One entry kind. `path` is the only kind validated against the filesystem. */
export type WhiteboardEntryKind = 'path' | 'rule' | 'fact' | 'task'

/** One pinned-board entry. */
export interface WhiteboardEntry {
  /** Stable entry id; the handle for pin/unpin/replace-by-id. */
  id: string
  kind: WhiteboardEntryKind
  /** The entry text (one compact line; `path` entries are project-relative paths). */
  text: string
  /** Pinned entries are never trimmed by an explicit compact; unpinned ones may be. */
  pinned: boolean
  /** Epoch ms the entry was (last) pinned; 0 when never pinned. */
  pinnedAt: number
  /** Entry version: 1 at creation, +1 per replace-by-id. */
  version: number
  /** Epoch ms of the last path validation. */
  lastValidatedAt?: number
  /** Set when a `path` entry no longer resolves; cleared when it does again. */
  stale?: boolean
}

/** The persisted board document under `enpoi-orchestration.whiteboard`. */
export interface WhiteboardDoc {
  /** Board version: 0 when never written, +1 per successful write. */
  version: number
  scope: WhiteboardScope
  /** Session the board applies to when `scope === 'session'`. */
  sessionId?: string
  /** Project (session cwd) the board applies to when `scope === 'project'`. */
  projectId?: string
  entries: WhiteboardEntry[]
  /** Epoch ms of the last write. */
  updatedAt: number
}

/** Runtime-context position: after the keeper's state checkpoint (130). */
export const WHITEBOARD_CONTEXT_ORDER = 140

/** Runtime-context contribution name. */
export const WHITEBOARD_CONTEXT_NAME = 'whiteboard'

/** Runtime-context contribution header. */
export const WHITEBOARD_HEADER = '### Pinned context'

/** Hard rendered budget (doc 67 §B) — a write over it is refused, never trimmed. */
export const DEFAULT_BUDGET_TOKENS = 1500

/** Conservative chars-per-token estimate used for the rendered block. */
export const CHARS_PER_TOKEN = 4

/** The empty board every read falls back to. */
export const EMPTY_WHITEBOARD: WhiteboardDoc = Object.freeze({
  version: 0,
  scope: 'global' as WhiteboardScope,
  entries: [] as WhiteboardEntry[],
  updatedAt: 0,
})

const KINDS: readonly WhiteboardEntryKind[] = ['path', 'rule', 'fact', 'task']
const SCOPES: readonly WhiteboardScope[] = ['session', 'project', 'global']

/** Whether a string is one of the three board scopes. */
export function isWhiteboardScope(value: unknown): value is WhiteboardScope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value)
}

/** Whether a string is one of the four entry kinds. */
export function isWhiteboardEntryKind(value: unknown): value is WhiteboardEntryKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Coerce one stored entry into a well-formed entry, dropping nothing but
 * repairing absent optional fields. A value with no usable text or kind is
 * skipped by {@link normalizeDoc}.
 */
export function normalizeEntry(raw: unknown): WhiteboardEntry | undefined {
  if (!isRecord(raw)) return undefined
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  const kind = isWhiteboardEntryKind(raw.kind) ? raw.kind : undefined
  if (text.length === 0 || kind === undefined) return undefined
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `wb-${Math.random().toString(36).slice(2, 10)}`
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 1
    ? Math.floor(raw.version)
    : 1
  const entry: WhiteboardEntry = {
    id,
    kind,
    text,
    pinned: raw.pinned === true,
    pinnedAt: typeof raw.pinnedAt === 'number' && Number.isFinite(raw.pinnedAt) ? raw.pinnedAt : 0,
    version,
  }
  if (typeof raw.lastValidatedAt === 'number' && Number.isFinite(raw.lastValidatedAt)) entry.lastValidatedAt = raw.lastValidatedAt
  if (raw.stale === true) entry.stale = true
  return entry
}

/**
 * Coerce the settings value into a board document. Unknown keys and malformed
 * entries are dropped, so a hand-edited settings file can never break a turn.
 * @param raw - the `enpoi-orchestration.whiteboard` value, if any.
 * @returns a well-formed board.
 */
export function normalizeDoc(raw: unknown): WhiteboardDoc {
  if (!isRecord(raw)) return { ...EMPTY_WHITEBOARD, entries: [] }
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter((entry): entry is WhiteboardEntry => entry !== undefined)
    : []
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 0
    ? Math.floor(raw.version)
    : 0
  const doc: WhiteboardDoc = {
    version,
    scope: isWhiteboardScope(raw.scope) ? raw.scope : 'global',
    entries,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  }
  if (typeof raw.sessionId === 'string' && raw.sessionId.length > 0) doc.sessionId = raw.sessionId
  if (typeof raw.projectId === 'string' && raw.projectId.length > 0) doc.projectId = raw.projectId
  return doc
}

/**
 * Render the board as the exact text injected into the runtime-context
 * snapshot. Compact by construction: one line per entry, pinned first.
 * @param doc - the board to render.
 * @returns the block, or `''` when the board holds no entries.
 */
export function renderWhiteboard(doc: WhiteboardDoc): string {
  if (doc.entries.length === 0) return ''
  const lines = doc.entries
    .slice()
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      return 0
    })
    .map((entry) => {
      const marker = entry.pinned ? '📌 ' : ''
      const stale = entry.stale === true ? ' (stale)' : ''
      return `- ${marker}[${entry.kind}] ${entry.text}${stale}`
    })
  return `${WHITEBOARD_HEADER} (v${doc.version})\n${lines.join('\n')}`
}

/** Character count of a rendered board, counted in code points (multibyte-safe). */
export function boardChars(rendered: string): number {
  return Array.from(rendered).length
}

/**
 * Estimate the rendered board's token cost. Conservative (4 chars/token) so the
 * hard budget refuses before a real tokenizer would overflow.
 * @param rendered - the exact injected text.
 * @returns estimated tokens, ceiling-rounded.
 */
export function estimateTokens(rendered: string): number {
  return Math.ceil(boardChars(rendered) / CHARS_PER_TOKEN)
}

/** The rendered character limit for a token budget. */
export function budgetChars(budgetTokens: number): number {
  return Math.max(0, Math.floor(budgetTokens)) * CHARS_PER_TOKEN
}

/** Result of one budget check. */
export interface BudgetCheck {
  ok: boolean
  tokens: number
  budget: number
  chars: number
  limit: number
}

/**
 * Check the complete rendered board against the hard budget.
 * @param doc - the candidate board.
 * @param budgetTokens - the configured hard budget.
 * @returns the check with the exact numbers for the refusal message.
 */
export function checkBudget(doc: WhiteboardDoc, budgetTokens: number): BudgetCheck {
  const chars = boardChars(renderWhiteboard(doc))
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN)
  const limit = budgetChars(budgetTokens)
  return { ok: chars <= limit, tokens, budget: budgetTokens, chars, limit }
}

/** One requested entry for a write. */
export interface WhiteboardWriteRequest {
  id?: string
  kind: WhiteboardEntryKind
  text: string
  pinned?: boolean
  /** Set for `mode: 'replace'` rows: the entry id to replace. */
  replaceId?: string
}

/** Result of linting path entries against the filesystem. */
export interface LintResult {
  doc: WhiteboardDoc
  /** Ids of path entries that no longer resolve. */
  stale: string[]
}

/**
 * Validate every `path` entry against the filesystem and flag the missing ones.
 * Stale entries stay in the board (flagged, never deleted) so the operator can
 * see and prune them.
 * @param doc - the board to lint.
 * @param resolvePath - maps an entry text to an absolute path.
 * @param exists - filesystem predicate (`fs.existsSync` in production).
 * @param now - epoch ms stamped into `lastValidatedAt`.
 * @returns the linted board and the stale ids.
 */
export function lintPaths(
  doc: WhiteboardDoc,
  resolvePath: (entry: WhiteboardEntry) => string,
  exists: (path: string) => boolean,
  now: number,
): LintResult {
  const stale: string[] = []
  const entries = doc.entries.map((entry): WhiteboardEntry => {
    if (entry.kind !== 'path') return entry
    let resolved: string
    try {
      resolved = resolvePath(entry)
    } catch {
      resolved = entry.text
    }
    const present = resolved.length > 0 && exists(resolved)
    const next: WhiteboardEntry = { ...entry, lastValidatedAt: now }
    if (present) delete next.stale
    else {
      next.stale = true
      stale.push(entry.id)
    }
    return next
  })
  return { doc: { ...doc, entries }, stale }
}

/**
 * Apply a batch of write requests: `append` adds new entries (an explicit id
 * must be unused), `replace` overwrites entries by id and bumps their version.
 * Budget and path lint are the caller's remaining steps — this function is the
 * pure board transition.
 * @param doc - the current board.
 * @param requests - entries to write.
 * @param mode - `append` (default) or `replace` by id.
 * @param now - epoch ms stamped on new entries and `updatedAt`.
 * @returns the next board, or a refusal message.
 */
export function applyWrites(
  doc: WhiteboardDoc,
  requests: readonly WhiteboardWriteRequest[],
  mode: 'append' | 'replace',
  now: number,
): { ok: true; doc: WhiteboardDoc } | { ok: false; message: string } {
  const entries = doc.entries.map((entry) => ({ ...entry }))
  for (const request of requests) {
    if (!isWhiteboardEntryKind(request.kind)) return { ok: false, message: `unknown entry kind "${String(request.kind)}"` }
    const text = typeof request.text === 'string' ? request.text.trim() : ''
    if (text.length === 0) return { ok: false, message: 'entry text must be a non-empty string' }
    if (mode === 'replace') {
      const id = request.replaceId ?? request.id
      if (typeof id !== 'string' || id.length === 0) return { ok: false, message: 'mode "replace" requires each entry to carry the id it replaces' }
      const index = entries.findIndex((entry) => entry.id === id)
      if (index === -1) return { ok: false, message: `no entry with id "${id}" to replace` }
      const previous = entries[index]!
      const next: WhiteboardEntry = {
        id,
        kind: request.kind,
        text,
        pinned: request.pinned ?? previous.pinned,
        pinnedAt: request.pinned === true && previous.pinned !== true ? now : previous.pinnedAt,
        version: previous.version + 1,
      }
      entries[index] = next
      continue
    }
    const id = typeof request.id === 'string' && request.id.length > 0
      ? request.id
      : `wb-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    if (entries.some((entry) => entry.id === id)) {
      return { ok: false, message: `entry id "${id}" already exists — use mode "replace" to overwrite it` }
    }
    entries.push({
      id,
      kind: request.kind,
      text,
      pinned: request.pinned === true,
      pinnedAt: request.pinned === true ? now : 0,
      version: 1,
    })
  }
  return { ok: true, doc: { ...doc, entries } }
}

/**
 * Toggle one entry's pinned flag. Unpin is the only way to make an entry
 * compactable; it never deletes anything.
 * @param doc - the current board.
 * @param id - the entry id.
 * @param pinned - the flag to set.
 * @param now - epoch ms for `pinnedAt`.
 * @returns the next board, or an error message.
 */
export function setPinned(
  doc: WhiteboardDoc,
  id: string,
  pinned: boolean,
  now: number,
): { ok: true; doc: WhiteboardDoc } | { ok: false; message: string } {
  const index = doc.entries.findIndex((entry) => entry.id === id)
  if (index === -1) return { ok: false, message: `no entry with id "${id}"` }
  const entries = doc.entries.map((entry, at) => (at === index
    ? { ...entry, pinned, pinnedAt: pinned ? now : entry.pinnedAt }
    : { ...entry }))
  return { ok: true, doc: { ...doc, entries } }
}

/** The scope facts one assembly resolves the board against. */
export interface BoardScopeFacts {
  /** The assembling agent's session id. */
  sessionId?: string
  /** The assembling session's durable parent session id (direct-child inheritance). */
  parentSessionId?: string
  /** The assembling session's project identity (session cwd). */
  projectId?: string
}

/**
 * Whether the board applies to an assembly. Most specific wins: a session board
 * applies to its own session and to its direct children (they inherit the
 * parent's authored truth); a project board applies to that project; a global
 * board applies everywhere.
 * @param doc - the board to test.
 * @param facts - the assembly's scope facts.
 * @returns whether the board renders into this assembly.
 */
export function boardApplies(doc: WhiteboardDoc, facts: BoardScopeFacts): boolean {
  if (doc.entries.length === 0) return false
  if (doc.scope === 'global') return true
  if (doc.scope === 'project') {
    if (doc.projectId === undefined || facts.projectId === undefined) return false
    return doc.projectId === facts.projectId
  }
  if (doc.sessionId === undefined) return false
  return doc.sessionId === facts.sessionId || doc.sessionId === facts.parentSessionId
}

/** The board's freshness line, recorded by every spawn whose request carries it. */
export function versionLine(doc: WhiteboardDoc): string {
  return `${WHITEBOARD_HEADER} v${doc.version} (${doc.scope}${doc.updatedAt > 0 ? ` · updated ${new Date(doc.updatedAt).toISOString()}` : ''})`
}
