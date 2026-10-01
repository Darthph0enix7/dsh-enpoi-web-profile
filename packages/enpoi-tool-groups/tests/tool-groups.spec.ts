import { describe, expect, it } from 'vitest'
import {
  denyNames, planGroupAction, preAttachFor, renderMenuText, resolveToolGroups, seatOfDescriptorLabel, SHIPPED_TOOL_GROUPS,
} from '../src/catalog.js'
import { applyToolGroupsProjection, toolGroupsProjection } from '../src/projection.js'
import { apply, TOOL_GROUPS_TOOL } from '../src/index.js'

const PEER = ['peer_status', 'peer_ask', 'peer_asks', 'peer_answer', 'peer_cancel']
const DEBUG = [
  'diagnostics_report', 'session_debug', 'session_event_read', 'session_event_search',
  'session_event_trace', 'session_search', 'session_trace',
]
const CORE = ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'subagent']

function catalogWith(document: unknown = undefined) {
  return resolveToolGroups(document)
}

/** Fake restriction installer recording every install and disposal. */
function fakeInstaller() {
  const calls: Array<{ agent: any; deny: string[]; disposed: boolean }> = []
  return {
    calls,
    install(agent: any, deny: readonly string[]) {
      const record = { agent, deny: [...deny], disposed: false }
      calls.push(record)
      return () => { record.disposed = true }
    },
    release() {},
    /** The deny set of the newest live (not disposed) install, if any. */
    live(): string[] | null {
      const record = [...calls].reverse().find(call => !call.disposed)
      return record === undefined ? null : record.deny
    },
  }
}

/** Fake projection registry backed by a mutable map (the real one folds events). */
function fakeProjections() {
  const state = new Map<string, { attached: readonly string[] | null }>()
  return {
    set(id: string, attached: readonly string[] | null) { state.set(id, { attached }) },
    stateOf(session: any) { return state.get(session.id) ?? { attached: null } },
  }
}

/** Fake settings service answering only the orchestration namespace. */
function fakeSettings(document: unknown) {
  return { get: (ns: string) => (ns === 'enpoi-orchestration' ? document : undefined) }
}

/** Minimal fake agent with a recording session log; `onAppend` mirrors the projection drive. */
function fakeAgent(id = 'session-1', onAppend?: (type: string, data: any) => void, descriptorLabel?: string) {
  const appended: Array<{ type: string; data: any; opts: any }> = []
  return {
    id,
    appended,
    session: {
      id,
      append: (type: string, data: any, opts: any) => {
        appended.push({ type, data, opts })
        onAppend?.(type, data)
      },
      ...(descriptorLabel === undefined
        ? {}
        : {
          ownEvents: () => [{ type: 'subagent/descriptor', data: { label: descriptorLabel, persona: 'fake' } }],
        }),
    },
  }
}

/** Fake preset ctx capturing handlers, sections, and registered tools. */
function fakeCtx(gets: Record<string, unknown> = {}, options: { toolVisible?: boolean } = {}) {
  const handlers = new Map<string, Array<(...args: any[]) => any>>()
  const sections: any[] = []
  const registeredTools: any[] = []
  return {
    handlers,
    sections,
    registeredTools,
    logger: { warn: () => {}, error: () => {} },
    get: (name: string) => gets[name],
    on(name: string, handler: (...args: any[]) => any) {
      const list = handlers.get(name) ?? []
      list.push(handler)
      handlers.set(name, list)
      return () => {}
    },
    tools: {
      register: (definition: any) => { registeredTools.push(definition); return () => {} },
      get: (name: string) => (options.toolVisible === false
        ? undefined
        : registeredTools.find(candidate => candidate.name === name)),
    },
    systemPrompt: { section: (section: any) => { sections.push(section); return () => {} } },
    fire(name: string, ...args: any[]) {
      for (const handler of handlers.get(name) ?? []) handler(...args)
    },
    /** Run the real waterfall chain for one event: each listener's `next` is the rest. */
    async gate(name: string, exec: any) {
      const list = handlers.get(name) ?? []
      let index = 0
      const step = async (): Promise<any> => {
        const handler = list[index]
        index += 1
        return handler === undefined ? { kind: 'allow' } : await handler(exec, step)
      }
      return await step()
    },
  }
}

function mount(options: {
  document?: unknown
  projections?: ReturnType<typeof fakeProjections> | null
  installer?: ReturnType<typeof fakeInstaller>
  seat?: string
  gets?: Record<string, unknown>
  toolVisible?: boolean
  registerThrows?: boolean
} = {}) {
  const incidents: Array<{ kind?: string; message?: string }> = []
  const gets: Record<string, unknown> = {
    diagnostics: { report: (request: { kind?: string; message?: string }) => { incidents.push(request); return { code: 'T1' } } },
    ...options.gets,
  }
  const ctx = fakeCtx(gets, { toolVisible: options.toolVisible })
  if (options.registerThrows === true) {
    ctx.tools.register = () => { throw new Error('register exploded') }
  }
  const installer = options.installer ?? fakeInstaller()
  const projections = options.projections === undefined ? fakeProjections() : options.projections
  const logs: string[] = []
  let error: unknown
  try {
    apply(ctx as any, { seat: options.seat ?? 'orchestrator' }, {
      installer: installer as any,
      projections: projections as any,
      settings: fakeSettings(options.document) as any,
      log: (line: string) => { logs.push(line) },
    })
  } catch (thrown: unknown) {
    error = thrown
  }
  const tool = ctx.registeredTools.find(candidate => candidate.name === TOOL_GROUPS_TOOL)
  const menu = ctx.sections.find(section => section.name === 'tool-groups:menu')
  return { ctx, installer, projections, tool, menu, incidents, error, logs }
}

const EXEC = (agent: any) => ({ agent, signal: new AbortController().signal })

describe('tool-group catalog', () => {
  it('ships peer and debug as the only on-demand groups and keeps every other family static', () => {
    const onDemand = SHIPPED_TOOL_GROUPS.filter(group => group.mode === 'on-demand').map(group => group.id)
    expect(onDemand).toEqual(['peer', 'debug'])
    const byId = new Map(SHIPPED_TOOL_GROUPS.map(group => [group.id, group]))
    expect(byId.get('peer')?.members).toEqual(PEER)
    expect(byId.get('debug')?.members).toEqual(DEBUG)
    // Core is the everyday surface; every shipped member is registered nowhere else.
    expect(byId.get('core')?.members.length).toBe(13)
  })

  it('denies exactly the on-demand members that are not attached and never a static member', () => {
    const catalog = catalogWith()
    expect(denyNames(catalog, new Set()).sort()).toEqual([...PEER, ...DEBUG].sort())
    expect(denyNames(catalog, new Set(['peer'])).sort()).toEqual([...DEBUG].sort())
    expect(denyNames(catalog, new Set(['peer', 'debug']))).toEqual([])
    const all = denyNames(catalog, new Set())
    for (const name of CORE) expect(all).not.toContain(name)
    // `run_code` is the PTC transport, never a group member.
    expect(all).not.toContain('run_code')
  })

  it('never hides a name that no group definition names (fail open)', () => {
    const catalog = catalogWith({ toolGroups: { groups: { ghost: { enabled: false } } } })
    expect(denyNames(catalog, new Set())).toEqual(denyNames(catalogWith(), new Set()))
    expect(denyNames(catalog, new Set())).not.toContain('some_unknown_tool')
    expect(denyNames(catalog, new Set())).not.toContain('ungrouped_synthetic')
  })

  it('never denies the reserved presentation transport, even if a hidden group lists it', () => {
    const catalog = catalogWith()
    const withRunCode = {
      ...catalog,
      groups: catalog.groups.map(group => group.id === 'peer'
        ? { ...group, members: [...group.members, 'run_code'] }
        : group),
    }
    const denied = denyNames(withRunCode as any, new Set())
    expect(denied).toContain('peer_ask')
    expect(denied).not.toContain('run_code')
  })

  it('always denies a disabled group, attached or not', () => {
    const catalog = catalogWith({ toolGroups: { groups: { peer: { enabled: false } } } })
    expect(denyNames(catalog, new Set(['peer']))).toContain('peer_ask')
    expect(denyNames(catalog, new Set(['peer', 'debug']))).toEqual([...PEER])
  })

  it('refuses attach for a disabled group with a reason', () => {
    const catalog = catalogWith({ toolGroups: { groups: { peer: { enabled: false } } } })
    const plan = planGroupAction(catalog, new Set(), 'attach', 'peer')
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toContain('disabled by the operator')
  })

  it('refuses attach/detach on a static group with a reason', () => {
    const catalog = catalogWith()
    for (const action of ['attach', 'detach'] as const) {
      const plan = planGroupAction(catalog, new Set(), action, 'core')
      expect(plan.ok).toBe(false)
      if (!plan.ok) expect(plan.reason).toContain('always on')
    }
  })

  it('plans attach to add exactly the named group and detach to remove exactly it', () => {
    const catalog = catalogWith()
    const attached = planGroupAction(catalog, new Set(), 'attach', 'peer')
    expect(attached).toEqual({ ok: true, attached: ['peer'] })
    const both = planGroupAction(catalog, new Set(['peer']), 'attach', 'debug')
    expect(both).toEqual({ ok: true, attached: ['peer', 'debug'] })
    const detached = planGroupAction(catalog, new Set(['peer', 'debug']), 'detach', 'peer')
    expect(detached).toEqual({ ok: true, attached: ['debug'] })
  })

  it('refuses unknown ids, duplicate attach, and detach of a group that is not attached', () => {
    const catalog = catalogWith()
    const unknown = planGroupAction(catalog, new Set(), 'attach', 'nope')
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.reason).toContain('unknown tool group')
    const duplicate = planGroupAction(catalog, new Set(['peer']), 'attach', 'peer')
    expect(duplicate.ok).toBe(false)
    const absent = planGroupAction(catalog, new Set(), 'detach', 'peer')
    expect(absent.ok).toBe(false)
    if (!absent.ok) expect(absent.reason).toContain('not attached')
  })

  it('ships the debug pre-attach for the Creator and broker by default', () => {
    const fresh = catalogWith()
    expect(preAttachFor(fresh, 'creator')).toEqual(['debug'])
    expect(preAttachFor(fresh, 'broker')).toEqual(['debug'])
    expect(preAttachFor(fresh, 'orchestrator')).toEqual([])
    // An explicit operator override still wins, including an empty one.
    const overridden = catalogWith({ toolGroups: { seats: { creator: { preAttach: [] } } } })
    expect(preAttachFor(overridden, 'creator')).toEqual([])
  })

  it('resolves per-seat pre-attach from the operator document over group defaults', () => {
    const catalog = catalogWith({ toolGroups: { seats: { sysadmin: { preAttach: ['debug'] } } } })
    expect(preAttachFor(catalog, 'sysadmin')).toEqual(['debug'])
    expect(preAttachFor(catalog, 'orchestrator')).toEqual([])
    // A disabled group can never be pre-attached.
    const disabled = catalogWith({
      toolGroups: { groups: { debug: { enabled: false } }, seats: { sysadmin: { preAttach: ['debug'] } } },
    })
    expect(preAttachFor(disabled, 'sysadmin')).toEqual([])
  })

  it('renders the menu with every enabled on-demand group, its purpose, and attach state', () => {
    const text = renderMenuText(catalogWith(), new Set(['peer']))
    expect(text).toContain('attach')
    expect(text).toContain('- peer —')
    expect(text).toContain('cross-device peer sessions')
    expect(text).toContain('(5 tools, attached)')
    expect(text).toContain('- debug —')
    expect(text).toContain('session log, event trace, and diagnostics inspection')
    expect(text).toContain('(7 tools, not attached)')
    expect(text).not.toContain('- core —')
    const disabled = renderMenuText(catalogWith({ toolGroups: { groups: { peer: { enabled: false } } } }), new Set())
    expect(disabled).not.toContain('- peer —')
    expect(disabled).toContain('- debug —')
  })
})

describe('toolGroups projection', () => {
  it('folds the complete attached set and ignores unrelated events', () => {
    const init = toolGroupsProjection.init({} as any, 0 as any)
    expect(init).toEqual({ attached: null })
    const unchanged = applyToolGroupsProjection(init, { type: 'turn/start', data: { turn: 1 } } as any)
    expect(unchanged).toBe(init)
    const changed = applyToolGroupsProjection(init, {
      type: 'tool-groups/change', data: { attached: ['peer', 'peer'] },
    } as any)
    expect(changed).toEqual({ attached: ['peer'] })
    expect(toolGroupsProjection.stateVersion).toBe(1)
  })
})

describe('tool_groups plugin', () => {
  it('installs the base surface at agent creation: every on-demand member denied, nothing static', () => {
    const { ctx, installer } = mount()
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    expect(installer.calls).toHaveLength(1)
    expect(installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())
    for (const name of CORE) expect(installer.live()).not.toContain(name)
  })

  it('attach adds exactly the group members and detach removes exactly them, at the turn boundary', async () => {
    const projections = fakeProjections()
    const { ctx, installer, tool, menu } = mount({ projections })
    const agent = fakeAgent('session-1', (type, data) => {
      if (type === 'tool-groups/change') projections.set('session-1', data.attached)
    })
    ctx.fire('agent/created', { agent, source: 'fresh' })
    expect(installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())

    const attached = await tool.execute({ action: 'attach', group: 'peer' }, EXEC(agent))
    expect(attached.ok).toBe(true)
    expect(attached.attached).toEqual(['peer'])
    expect(agent.appended).toHaveLength(1)
    expect(agent.appended[0].type).toBe('tool-groups/change')
    expect(agent.appended[0].data).toEqual({ attached: ['peer'] })
    expect(agent.appended[0].opts).toEqual({ ignorable: true })
    // The filter does not change mid-turn: the current request's catalog stays.
    expect(installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())
    // The menu names the pending change instead of claiming it is live.
    expect(menu.text({ scope: agent })).toContain('attached — applies from the next turn')

    // The projection drive committed the event; turn/end applies it.
    ctx.fire('session/event', agent.session, { type: 'turn/end', data: { turn: 1 } })
    expect(installer.live()?.sort()).toEqual([...DEBUG].sort())
    for (const name of PEER) expect(installer.live()).not.toContain(name)

    const detached = await tool.execute({ action: 'detach', group: 'peer' }, EXEC(agent))
    expect(detached.ok).toBe(true)
    expect(detached.attached).toEqual([])
    ctx.fire('session/event', agent.session, { type: 'turn/end', data: { turn: 2 } })
    expect(installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())
  })

  it('removes the restriction entirely when every on-demand group is attached', async () => {
    const projections = fakeProjections()
    const { ctx, installer, tool } = mount({ projections })
    const agent = fakeAgent('session-1', (type, data) => {
      if (type === 'tool-groups/change') projections.set('session-1', data.attached)
    })
    ctx.fire('agent/created', { agent, source: 'fresh' })
    await tool.execute({ action: 'attach', group: 'peer' }, EXEC(agent))
    await tool.execute({ action: 'attach', group: 'debug' }, EXEC(agent))
    expect(agent.appended[1].data).toEqual({ attached: ['peer', 'debug'] })
    ctx.fire('session/event', agent.session, { type: 'turn/end', data: { turn: 1 } })
    expect(installer.calls[0].disposed).toBe(true)
    expect(installer.live()).toBeNull()
  })

  it('refuses attach of a disabled group with a reason and appends nothing', async () => {
    const { ctx, installer, tool } = mount({
      document: { toolGroups: { groups: { peer: { enabled: false } } } },
    })
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    expect(installer.live()).toContain('peer_ask')
    const refused = await tool.execute({ action: 'attach', group: 'peer' }, EXEC(agent))
    expect(refused.ok).toBe(false)
    expect(refused.reason).toContain('disabled by the operator')
    expect(agent.appended).toHaveLength(0)
  })

  it('fails open when no projection registry exists: no restriction and no refusal of tool visibility', () => {
    const { ctx, installer } = mount({ projections: null })
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    expect(installer.calls).toHaveLength(0)
    expect(denyNames(catalogWith(), new Set())).toContain('peer_ask')
  })

  it('restores the attached set from the projection on resume', () => {
    const projections = fakeProjections()
    const first = mount({ projections })
    const agent = fakeAgent('resumed')
    first.ctx.fire('agent/created', { agent, source: 'resume' })
    expect(first.installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())
    projections.set('resumed', ['debug'])
    const second = mount({ projections })
    const secondInstaller = second.installer
    second.ctx.fire('agent/created', { agent, source: 'resume' })
    expect(secondInstaller.live()?.sort()).toEqual([...PEER].sort())
  })

  it('lists every enabled on-demand group with members and state, and renders the menu', async () => {
    const projections = fakeProjections()
    const { ctx, tool, menu } = mount({ projections })
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    const listed = await tool.execute({ action: 'list' }, EXEC(agent))
    expect(listed.ok).toBe(true)
    expect(listed.groups.map((group: any) => group.id)).toEqual(['peer', 'debug'])
    expect(listed.groups[0].members).toEqual(PEER)
    expect(listed.groups[0].attached).toBe(false)

    const text = menu.text({ scope: agent })
    expect(text).toContain('- peer —')
    expect(text).toContain('- debug —')
    expect(text).toContain('(5 tools, not attached)')
    expect(text).toContain('Call tool_groups')
    expect(menu.text({ scope: undefined })).toBe('')
  })

  it('rejects a malformed action without touching state', async () => {
    const { ctx, tool } = mount()
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    const bad = await tool.execute({ action: 'explode' }, EXEC(agent))
    expect(bad.ok).toBe(false)
    expect(bad.reason).toContain('action must be one of')
    const missing = await tool.execute({ action: 'attach' }, EXEC(agent))
    expect(missing.ok).toBe(false)
    expect(missing.reason).toContain('requires a group id')
    expect(agent.appended).toHaveLength(0)
  })

  it('records a mount-failed incident and rethrows when registration fails', () => {
    const { error, incidents } = mount({ registerThrows: true })
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('register exploded')
    expect(incidents.some(incident => incident.kind === 'tool-groups/mount-failed')).toBe(true)
  })

  it('records a mount-failed incident and rethrows when the meta-tool does not resolve', () => {
    const { error, incidents } = mount({ toolVisible: false })
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('did not register')
    expect(incidents.some(incident => incident.kind === 'tool-groups/mount-failed')).toBe(true)
  })

  it('records an inert incident and fails open when projection registration is rejected', () => {
    const { ctx, installer, tool, incidents, error } = mount({
      gets: { sessionProjections: { register: () => { throw new Error('projection boom') } } },
    })
    expect(error).toBeUndefined()
    expect(tool).toBeDefined()
    expect(incidents.some(incident => incident.kind === 'tool-groups/inert')).toBe(true)
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    expect(installer.calls).toHaveLength(0)
  })

  it('records an inert incident once per session when a restriction cannot install', () => {
    const installer = fakeInstaller()
    const failing = {
      calls: installer.calls,
      install: () => { throw new Error('restrict boom') },
      release: () => {},
      live: () => null,
    }
    const { ctx, incidents } = mount({ installer: failing as any })
    const agent = fakeAgent()
    ctx.fire('agent/created', { agent, source: 'fresh' })
    ctx.fire('session/event', agent.session, { type: 'turn/end', data: { turn: 1 } })
    expect(incidents.filter(incident => incident.kind === 'tool-groups/inert')).toHaveLength(1)
  })

  it('writes a mount witness naming the seat and the on-demand groups', () => {
    const { logs } = mount()
    expect(logs.some(line => line.includes('[enpoi-tool-groups] mounted')
      && line.includes('seat=orchestrator')
      && line.includes('on-demand: peer, debug'))).toBe(true)
  })

  it('tells the model to end the turn after attach (tools are next-turn only)', async () => {
    const projections = fakeProjections()
    const { ctx, tool } = mount({ projections })
    const agent = fakeAgent('s-message', (type, data) => {
      if (type === 'tool-groups/change') projections.set('s-message', data.attached)
    })
    ctx.fire('agent/created', { agent, source: 'fresh' })

    const attached = await tool.execute({ action: 'attach', group: 'peer' }, EXEC(agent))
    const attachText = tool.output.render({}, attached)[0].text
    expect(attachText).toContain('END YOUR TURN NOW')
    expect(attachText).toContain('next turn')
    expect(attachText).toContain('do not retry')

    const detached = await tool.execute({ action: 'detach', group: 'peer' }, EXEC(agent))
    const detachText = tool.output.render({}, detached)[0].text
    expect(detachText).toContain('next turn')
  })

  it('replaces UNKNOWN_TOOL with a next-action hint for not-callable group tools', async () => {
    const projections = fakeProjections()
    const { ctx, tool } = mount({ projections })
    const agent = fakeAgent('s-hint', (type, data) => {
      if (type === 'tool-groups/change') projections.set('s-hint', data.attached)
    })
    ctx.fire('agent/created', { agent, source: 'fresh' })
    const handlers = ctx.handlers.get('tools/pre-execute') ?? []
    // [group hint, per-action meta-tool policy] — the hint is registered first.
    expect(handlers).toHaveLength(2)
    const run = (name: string) => handlers[0]({ agent, name }, () => Promise.resolve({ kind: 'allow' }))

    // Never attached: point at the attach action.
    const unattached = await run('session_debug')
    expect(unattached.kind).toBe('deny')
    expect(unattached.reason).toContain('not attached')
    expect(unattached.reason).toContain('attach')

    // Attached this turn but not callable yet: end the turn.
    await tool.execute({ action: 'attach', group: 'peer' }, EXEC(agent))
    const pending = await run('peer_status')
    expect(pending.kind).toBe('deny')
    expect(pending.reason).toContain('End your turn now')
    expect(pending.reason).toContain('next turn')

    // Static, ungrouped, and meta-tool names delegate untouched.
    expect((await run('read')).kind).toBe('allow')
    expect((await run('tool_groups')).kind).toBe('allow')

    // After the boundary the call is normal again.
    ctx.fire('session/event', agent.session, { type: 'turn/end', data: { turn: 1 } })
    expect((await run('peer_status')).kind).toBe('allow')
  })

  it('hints operator-disabled membership instead of UNKNOWN_TOOL', async () => {
    const { ctx } = mount({ document: { toolGroups: { groups: { peer: { enabled: false } } } } })
    const agent = fakeAgent('s-disabled')
    ctx.fire('agent/created', { agent, source: 'fresh' })
    const handler = (ctx.handlers.get('tools/pre-execute') ?? [])[0]
    const decision = await handler({ agent, name: 'peer_ask' }, () => Promise.resolve({ kind: 'allow' }))
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('disabled by the operator')
  })
})

describe('descriptor seat resolution', () => {
  it('maps council seat labels to their seat ids and leaves generic labels unnamed', () => {
    expect(seatOfDescriptorLabel('roundtable seat: pragmatist')).toBe('pragmatist')
    expect(seatOfDescriptorLabel('chorus seat: Visionary')).toBe('visionary')
    expect(seatOfDescriptorLabel('council chair: roundtable')).toBe('chair')
    expect(seatOfDescriptorLabel('council referee: epoch 2')).toBe('referee')
    expect(seatOfDescriptorLabel('council broker: 4 questions (epoch 2)')).toBe('broker')
    expect(seatOfDescriptorLabel('fixer: patch the retry loop')).toBeUndefined()
    expect(seatOfDescriptorLabel(undefined)).toBeUndefined()
    expect(seatOfDescriptorLabel('')).toBeUndefined()
  })
})

describe('tool_groups per-action policy', () => {
  /** The downstream capability ask the policy layer must (or must not) reach. */
  function downstream(ctx: ReturnType<typeof mount>['ctx']) {
    const state = { asked: 0 }
    ctx.on('tools/pre-execute', () => {
      state.asked += 1
      return Promise.resolve({ kind: 'ask', reason: 'unconfigured tool tool_groups requires approval (default)' })
    })
    return state
  }

  it('allows list without reaching the downstream ask — root and child', async () => {
    const { ctx } = mount()
    const asked = downstream(ctx)
    const root = fakeAgent('root-1')
    const child = fakeAgent('child-1', undefined, 'roundtable seat: pragmatist')
    for (const agent of [root, child]) {
      const decision = await ctx.gate('tools/pre-execute', { name: 'tool_groups', arguments: { action: 'list' }, agent })
      expect(decision).toEqual({ kind: 'allow' })
    }
    expect(asked.asked).toBe(0)
  })

  it('defers attach of a non-declared group to the downstream ask (forwarded normally)', async () => {
    const { ctx } = mount({ document: { toolGroups: { seats: { pragmatist: { preAttach: [] } } } } })
    const asked = downstream(ctx)
    const child = fakeAgent('child-1', undefined, 'roundtable seat: pragmatist')
    const decision = await ctx.gate('tools/pre-execute', {
      name: 'tool_groups', arguments: { action: 'attach', group: 'debug' }, agent: child,
    })
    expect(asked.asked).toBe(1)
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('unconfigured tool tool_groups requires approval')
  })

  it('allows attach/detach of a declared group without reaching the downstream ask', async () => {
    const { ctx } = mount({ document: { toolGroups: { seats: { broker: { preAttach: ['debug'] } } } } })
    const asked = downstream(ctx)
    const broker = fakeAgent('child-2', undefined, 'council broker: 2 questions (epoch 1)')
    for (const action of ['attach', 'detach'] as const) {
      const decision = await ctx.gate('tools/pre-execute', {
        name: 'tool_groups', arguments: { action, group: 'debug' }, agent: broker,
      })
      expect(decision).toEqual({ kind: 'allow' })
    }
    expect(asked.asked).toBe(0)
  })

  it('starts a declared seat with its group attached and the rest denied', () => {
    const { ctx, installer } = mount({ document: { toolGroups: { seats: { broker: { preAttach: ['debug'] } } } } })
    const broker = fakeAgent('child-3', undefined, 'council broker: 1 question (epoch 1)')
    ctx.fire('agent/created', { agent: broker, source: 'fresh' })
    expect(installer.live()?.sort()).toEqual([...PEER].sort())
    expect(installer.live()).not.toContain('session_search')
  })

  it('keeps the other seats on the base on-demand surface', () => {
    const { ctx, installer } = mount({ document: { toolGroups: { seats: { broker: { preAttach: ['debug'] } } } } })
    const debater = fakeAgent('child-4', undefined, 'roundtable seat: skeptic')
    ctx.fire('agent/created', { agent: debater, source: 'fresh' })
    expect(installer.live()?.sort()).toEqual([...PEER, ...DEBUG].sort())
  })
})
