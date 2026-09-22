import { describe, it, expect, vi } from 'vitest'
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
  type WhiteboardDoc,
} from '../src/board'
import { apply as applyWhiteboard, readWhiteboard } from '../src/index'

/** In-memory settings service with revision fencing (conflict on a stale writer). */
function makeSettings(initialBoard?: unknown) {
  let board = initialBoard
  let revision = 1
  const mutate = vi.fn(async (_ns: string, ops: Array<{ path: string[]; value: unknown }>, expected?: number) => {
    if (expected !== undefined && expected !== revision) {
      throw Object.assign(new Error('settings conflict'), { code: 'SETTINGS_CONFLICT' })
    }
    for (const op of ops) if (op.path.join('.') === 'whiteboard') board = op.value
    revision += 1
  })
  return {
    mutate,
    get board() { return board },
    set board(next: unknown) { board = next },
    get: (ns: string) => (ns === 'enpoi-orchestration' ? { whiteboard: board } : undefined),
    describe: () => [{ ns: 'enpoi-orchestration', revision }],
  }
}

/** Fake ctx capturing registered tool definitions. */
function makeCtx(settings: ReturnType<typeof makeSettings>) {
  const definitions = new Map<string, { name: string; execute: (args: unknown, exec?: unknown) => Promise<Record<string, unknown>> }>()
  const ctx = {
    get: (name: string) => (name === 'settings' ? settings : undefined),
    tools: { register: (definition: { name: string }) => { definitions.set(definition.name, definition as never) } },
    effect: (factory: () => unknown) => factory(),
    on: () => () => {},
  }
  return { ctx, definitions }
}

const sessionExec = { agent: { session: { id: 'sess-1', header: { cwd: '/tmp/opencode/heart-home' } } } }

describe('enpoi-whiteboard board vocabulary', () => {
  it('normalizes a malformed stored value into the empty board', () => {
    expect(normalizeDoc(undefined)).toMatchObject({ version: 0, entries: [] })
    expect(normalizeDoc({ version: 'x', entries: [{ kind: 'bogus', text: 'x' }, { kind: 'rule', text: '' }] })).toMatchObject({ version: 0, entries: [] })
  })

  it('renders pinned first, marks stale, and carries the board version', () => {
    const doc: WhiteboardDoc = {
      version: 4,
      scope: 'global',
      updatedAt: 0,
      entries: [
        { id: 'a', kind: 'fact', text: 'plain', pinned: false, pinnedAt: 0, version: 1 },
        { id: 'b', kind: 'path', text: 'docs/x.md', pinned: true, pinnedAt: 1, version: 3, stale: true },
      ],
    }
    const rendered = renderWhiteboard(doc)
    expect(rendered.startsWith('### Pinned context (v4)')).toBe(true)
    expect(rendered.indexOf('docs/x.md')).toBeLessThan(rendered.indexOf('plain'))
    expect(rendered).toContain('📌 [path] docs/x.md (stale)')
  })

  it('measures the budget in code points and refuses exactly over the limit', () => {
    const budget = 10
    const doc = normalizeDoc({
      version: 1,
      entries: [{ id: 'a', kind: 'rule', text: 'x'.repeat(200), version: 1 }],
    })
    const check = checkBudget(doc, budget)
    expect(check.ok).toBe(false)
    expect(check.tokens).toBeGreaterThan(check.budget)
    // Multibyte text counts as code points, not UTF-16 units.
    expect(estimateTokens('🎯🎯🎯🎯')).toBe(1)
  })

  it('append rejects a duplicate id; replace bumps the entry version', () => {
    const base = normalizeDoc({ version: 1, entries: [{ id: 'a', kind: 'rule', text: 'one', version: 1 }] })
    const duplicate = applyWrites(base, [{ id: 'a', kind: 'rule', text: 'two' }], 'append', 5)
    expect(duplicate.ok).toBe(false)
    const replaced = applyWrites(base, [{ replaceId: 'a', kind: 'rule', text: 'two' }], 'replace', 5)
    expect(replaced.ok).toBe(true)
    if (!replaced.ok) throw new Error('unreachable')
    expect(replaced.doc.entries[0]).toMatchObject({ text: 'two', version: 2 })
  })

  it('lint flags missing paths and never deletes them', () => {
    const doc = normalizeDoc({
      version: 2,
      entries: [
        { id: 'a', kind: 'path', text: 'missing.md', version: 1 },
        { id: 'b', kind: 'rule', text: 'keep', version: 1 },
      ],
    })
    const { doc: linted, stale } = lintPaths(doc, (entry) => `/root/${entry.text}`, (path) => path === '/root/keep.md', 99)
    expect(stale).toEqual(['a'])
    expect(linted.entries).toHaveLength(2)
    expect(linted.entries[0]).toMatchObject({ id: 'a', stale: true, lastValidatedAt: 99 })
    expect(linted.entries[1]!.stale).toBeUndefined()
  })

  it('pin/unpin toggles the flag without touching text or version', () => {
    const doc = normalizeDoc({ version: 1, entries: [{ id: 'a', kind: 'rule', text: 'one', version: 3 }] })
    const pinned = setPinned(doc, 'a', true, 7)
    expect(pinned.ok).toBe(true)
    if (!pinned.ok) throw new Error('unreachable')
    expect(pinned.doc.entries[0]).toMatchObject({ pinned: true, pinnedAt: 7, version: 3, text: 'one' })
    const unpinned = setPinned(pinned.doc, 'a', false, 8)
    expect(unpinned.ok).toBe(true)
    if (!unpinned.ok) throw new Error('unreachable')
    expect(unpinned.doc.entries[0]).toMatchObject({ pinned: false, pinnedAt: 7, version: 3 })
  })

  it('scope resolution prefers the specific board and lets a direct child inherit', () => {
    const globalDoc = normalizeDoc({ version: 1, scope: 'global', entries: [{ id: 'g', kind: 'rule', text: 'g', version: 1 }] })
    expect(boardApplies(globalDoc, {})).toBe(true)
    const sessionDoc = normalizeDoc({ version: 1, scope: 'session', sessionId: 'parent', entries: [{ id: 's', kind: 'rule', text: 's', version: 1 }] })
    expect(boardApplies(sessionDoc, { sessionId: 'parent' })).toBe(true)
    expect(boardApplies(sessionDoc, { sessionId: 'child', parentSessionId: 'parent' })).toBe(true)
    expect(boardApplies(sessionDoc, { sessionId: 'unrelated' })).toBe(false)
    const projectDoc = normalizeDoc({ version: 1, scope: 'project', projectId: '/p', entries: [{ id: 'p', kind: 'rule', text: 'p', version: 1 }] })
    expect(boardApplies(projectDoc, { projectId: '/p' })).toBe(true)
    expect(boardApplies(projectDoc, { projectId: '/other' })).toBe(false)
  })
})

describe('enpoi-whiteboard tools', () => {
  it('round-trips a write (version bump) and a read', async () => {
    const settings = makeSettings()
    const { ctx, definitions } = makeCtx(settings)
    applyWhiteboard(ctx as never, {})

    const write = await definitions.get('whiteboard_write')!.execute({
      entries: [{ id: 'rule-1', kind: 'rule', text: 'Never restart the service without asking.', pinned: true }],
    }, sessionExec)
    expect(write.ok).toBe(true)
    expect(write.version).toBe(1)
    expect(settings.board).toMatchObject({ version: 1, scope: 'global' })
    expect((settings.board as WhiteboardDoc).entries[0]).toMatchObject({ id: 'rule-1', pinned: true, version: 1 })

    const read = await definitions.get('whiteboard_read')!.execute({}, sessionExec)
    expect(read.ok).toBe(true)
    expect(read.version).toBe(1)
    expect(read.tokens).toBe(estimateTokens(String(read.rendered)))
  })

  it('refuses an over-budget write and writes nothing', async () => {
    const settings = makeSettings()
    const { ctx, definitions } = makeCtx(settings)
    applyWhiteboard(ctx as never, { budgetTokens: 40 })

    const small = await definitions.get('whiteboard_write')!.execute({
      entries: [{ id: 'a', kind: 'rule', text: 'ok' }],
    }, sessionExec)
    expect(small.ok).toBe(true)
    const before = JSON.stringify(settings.board)

    const huge = await definitions.get('whiteboard_write')!.execute({
      entries: [{ id: 'b', kind: 'fact', text: 'y'.repeat(4000) }],
    }, sessionExec)
    expect(huge.ok).toBe(false)
    expect(String(huge.message)).toContain('Over budget')
    expect(Number(huge.tokens)).toBeGreaterThan(40)
    expect(JSON.stringify(settings.board)).toBe(before)
  })

  it('flags a missing path entry as stale instead of deleting it', async () => {
    const settings = makeSettings()
    const { ctx, definitions } = makeCtx(settings)
    applyWhiteboard(ctx as never, {})

    const result = await definitions.get('whiteboard_write')!.execute({
      entries: [{ id: 'p1', kind: 'path', text: 'definitely-not-a-real-file-9f3a.md' }],
    }, sessionExec)
    expect(result.ok).toBe(true)
    expect(result.stale).toEqual(['p1'])
    const stored = (settings.board as WhiteboardDoc).entries.find((entry) => entry.id === 'p1')
    expect(stored).toMatchObject({ stale: true, kind: 'path' })
  })

  it('pins and unpins by id through the settings service', async () => {
    const settings = makeSettings()
    const { ctx, definitions } = makeCtx(settings)
    applyWhiteboard(ctx as never, {})
    await definitions.get('whiteboard_write')!.execute({ entries: [{ id: 'a', kind: 'task', text: 'ship the heart' }] }, sessionExec)

    const pinned = await definitions.get('whiteboard_pin')!.execute({ id: 'a' }, sessionExec)
    expect(pinned.ok).toBe(true)
    expect((settings.board as WhiteboardDoc).entries[0]!.pinned).toBe(true)

    const unpinned = await definitions.get('whiteboard_unpin')!.execute({ id: 'a' }, sessionExec)
    expect(unpinned.ok).toBe(true)
    expect((settings.board as WhiteboardDoc).entries[0]!.pinned).toBe(false)

    const missing = await definitions.get('whiteboard_pin')!.execute({ id: 'nope' }, sessionExec)
    expect(missing.ok).toBe(false)
    expect(String(missing.message)).toContain('no entry with id')
  })

  it('replays the write across a settings revision conflict (no silent clobber)', async () => {
    const settings = makeSettings()
    const { ctx, definitions } = makeCtx(settings)
    applyWhiteboard(ctx as never, {})
    // First mutate call throws a conflict once, then succeeds on the retry.
    settings.mutate.mockImplementationOnce(async () => {
      throw Object.assign(new Error('settings conflict'), { code: 'SETTINGS_CONFLICT' })
    })
    const result = await definitions.get('whiteboard_write')!.execute({ entries: [{ id: 'a', kind: 'rule', text: 'retry me' }] }, sessionExec)
    expect(result.ok).toBe(true)
    expect(settings.mutate).toHaveBeenCalledTimes(2)
  })
})

describe('enpoi-whiteboard context injection (real system-prompt seam)', () => {
  it('renders the board into a parent assembly and a delegated child assembly', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
    const { renderContextSnapshot } = await import('@deepseek-ai/dsh-system-prompt')

    const ctx = new Context() as unknown as {
      plugin: (plugin: unknown, config?: unknown) => Promise<unknown>
      provide: (name: string, value: unknown) => void
      systemPrompt: { assemble: (input: unknown) => Promise<unknown> }
      get: (name: string) => unknown
    }
    const settings = makeSettings(normalizeDoc({
      version: 3,
      scope: 'session',
      sessionId: 'parent-session',
      entries: [{ id: 'a', kind: 'path', text: 'docs/67-heart-implementation-plan.md', pinned: true, pinnedAt: 1, version: 2 }],
    }))
    ctx.provide('settings', settings)
    await ctx.plugin(SystemPrompt, {})
    applyWhiteboard(ctx as never, { budgetTokens: 1500 })

    const parent = { session: { id: 'parent-session', header: { cwd: '/home/adam' } } }
    const parentAssembly = await ctx.systemPrompt.assemble({ scope: parent, agent: parent }) as never
    const parentSnapshot = renderContextSnapshot(parentAssembly)
    expect(parentSnapshot).toContain('### Pinned context (v3)')
    expect(parentSnapshot).toContain('docs/67-heart-implementation-plan.md')

    // A direct child (durable parentSession lineage) inherits the parent board,
    // and its request records the version it inherited.
    const child = { session: { id: 'child-session', header: { cwd: '/home/adam', parentSession: 'parent-session' } } }
    const childAssembly = await ctx.systemPrompt.assemble({ scope: child, agent: child }) as never
    const childSnapshot = renderContextSnapshot(childAssembly)
    expect(childSnapshot).toContain('### Pinned context (v3)')

    // An unrelated session renders nothing (a session board never leaks).
    const unrelated = { session: { id: 'other-session', header: { cwd: '/home/adam' } } }
    const otherAssembly = await ctx.systemPrompt.assemble({ scope: unrelated, agent: unrelated }) as never
    expect(renderContextSnapshot(otherAssembly)).not.toContain('Pinned context')

    // The contribution sits after the keeper's state checkpoint (130).
    expect(WHITEBOARD_CONTEXT_ORDER).toBeGreaterThan(130)
    expect(WHITEBOARD_CONTEXT_NAME).toBe('whiteboard')
  })
})

describe('enpoi-whiteboard settings fallback', () => {
  it('reads the empty board when settings are unavailable', () => {
    const ctx = { get: () => undefined }
    expect(readWhiteboard(ctx as never)).toMatchObject({ version: 0, entries: [] })
  })
})
