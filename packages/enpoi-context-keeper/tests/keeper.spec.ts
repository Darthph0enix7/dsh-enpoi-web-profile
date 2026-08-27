import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveKeeperRoute, arm, run, type KeeperState } from '../src/index'

/** Minimal session mock satisfying frameInput + append + seq reads. */
function makeSession(events: Array<{ type: string; seq: number; data: unknown }> = []) {
  return {
    id: 'test-session',
    seq: events.length > 0 ? events[events.length - 1]!.seq : 0,
    events,
    append: vi.fn(),
  }
}

/** Minimal ctx mock: settings + llm.stream + logger. */
function makeCtx(overrides: {
  personas?: Record<string, { provider?: string; model?: string; reasoningEffort?: string }>
  stream?: (opts: { provider: string; model: string }) => AsyncGenerator<unknown>
} = {}) {
  const stream = overrides.stream ?? (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '🎯 ACTIVE GOAL: test goal\n- Test goal bullet\nCLAIMS: []' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '🎯 ACTIVE GOAL: test goal\n- Test goal bullet\nCLAIMS: []' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  return {
    get: (ns: string) => {
      if (ns === 'settings') {
        return {
          get: () => ({ personas: overrides.personas ?? {} }),
        }
      }
      return undefined
    },
    llm: { stream },
    logger: { info: vi.fn(), warn: vi.fn() },
  }
}

const baseConfig = {
  provider: 'freellmapi',
  model: 'auto',
  fallbackProvider: 'antigravity',
  fallbackModel: 'gemini-3.7-flash-tiered',
  debounceMs: 15_000,
  leaseMs: 45_000,
  maxInputEvents: 80,
  maxOutputTokens: 2048,
}

describe('enpoi-context-keeper route resolution', () => {
  it('uses plugin Config primary when no keeper persona is assigned', () => {
    const ctx = makeCtx({ personas: {} })
    const route = resolveKeeperRoute(ctx as never, baseConfig)
    expect(route.provider).toBe('freellmapi')
    expect(route.model).toBe('auto')
    expect(route.fallbackProvider).toBe('antigravity')
    expect(route.fallbackModel).toBe('gemini-3.7-flash-tiered')
    expect(route.reasoningEffort).toBeUndefined()
  })

  it('uses the assigned keeper persona as primary, keeping the config fallback', () => {
    const ctx = makeCtx({
      personas: { keeper: { provider: 'antigravity', model: 'gemini-3.7-flash-tiered' } },
    })
    const route = resolveKeeperRoute(ctx as never, baseConfig)
    expect(route.provider).toBe('antigravity')
    expect(route.model).toBe('gemini-3.7-flash-tiered')
    expect(route.fallbackProvider).toBe('antigravity')
    expect(route.fallbackModel).toBe('gemini-3.7-flash-tiered')
  })

  it('forwards reasoningEffort when the assignment carries one', () => {
    const ctx = makeCtx({
      personas: { keeper: { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'high' } },
    })
    const route = resolveKeeperRoute(ctx as never, baseConfig)
    expect(route.provider).toBe('deepseek')
    expect(route.model).toBe('deepseek-v4-flash')
    expect(route.reasoningEffort).toBe('high')
  })

  it('ignores partial entries (provider without model) and falls back to config', () => {
    const ctx = makeCtx({
      personas: { keeper: { provider: 'deepseek' } },
    })
    const route = resolveKeeperRoute(ctx as never, baseConfig)
    expect(route.provider).toBe('freellmapi')
    expect(route.model).toBe('auto')
  })

  it('falls back to config when settings are unavailable', () => {
    const ctx = { get: () => undefined, llm: {}, logger: {} }
    const route = resolveKeeperRoute(ctx as never, baseConfig)
    expect(route.provider).toBe('freellmapi')
    expect(route.model).toBe('auto')
  })
})

describe('enpoi-context-keeper state machine (wedge fix)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('latches a trailing re-run when a turn ends mid-pass and never wedges', async () => {
    // Deferred gate: the first LLM stream blocks until we release it.
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    let streamCalls = 0
    const stream = async function* () {
      streamCalls += 1
      if (streamCalls === 1) {
        await firstGate
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '🎯 ACTIVE GOAL: test goal\n- Test goal bullet\nCLAIMS: []' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '🎯 ACTIVE GOAL: test goal\n- Test goal bullet\nCLAIMS: []' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const ctx = makeCtx({ stream })
    const states = new Map<string, KeeperState>()
    const session = makeSession([
      { type: 'user/message', seq: 1, data: { content: 'hello' } },
      { type: 'assistant/message', seq: 2, data: { text: 'hi' } },
    ])

    // Turn 1 ends → arm → debounce fires → run() starts and blocks on the gate.
    arm(ctx as never, baseConfig, states, session as never, 1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(states.get('test-session')!.running).toBe(true)

    // Turn 2 ends while the pass is in flight → arm() re-arms; the new timer
    // fires, run() sees running=true and latches rerunRequested.
    arm(ctx as never, baseConfig, states, session as never, 2)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(states.get('test-session')!.rerunRequested).toBe(true)

    // Release the first pass. Its finally must schedule the trailing re-run.
    releaseFirst()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.get('test-session')!.running).toBe(false)
    expect(states.get('test-session')!.timer).not.toBeNull()

    // The trailing pass runs and completes — the keeper is NOT wedged.
    await vi.advanceTimersByTimeAsync(15_000)
    expect(streamCalls).toBe(2)
    expect(states.get('test-session')!.running).toBe(false)
    expect(states.get('test-session')!.rerunRequested).toBe(false)
    expect(session.append).toHaveBeenCalledTimes(2)
  })

  it('records the actually-served route in brief/prose-updated.model', async () => {
    const ctx = makeCtx({
      personas: { keeper: { provider: 'deepseek', model: 'deepseek-v4-flash' } },
    })
    const states = new Map<string, KeeperState>()
    const session = makeSession([
      { type: 'user/message', seq: 1, data: { content: 'hello' } },
      { type: 'assistant/message', seq: 2, data: { text: 'hi' } },
    ])

    arm(ctx as never, baseConfig, states, session as never, 1)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(session.append).toHaveBeenCalledTimes(1)
    const [type, payload] = session.append.mock.calls[0] as [string, { model: string }]
    expect(type).toBe('brief/prose-updated')
    expect(payload.model).toBe('deepseek/deepseek-v4-flash')
  })

  it('falls back to the fallback route when the primary fails and records the served route', async () => {
    let call = 0
    const stream = async function* () {
      call += 1
      if (call === 1) {
        // Primary route: hard failure mid-stream.
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'upstream down', code: 'UPSTREAM' } } }
        return
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '🎯 ACTIVE GOAL: fallback goal\n- Fallback bullet\nCLAIMS: []' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '🎯 ACTIVE GOAL: fallback goal\n- Fallback bullet\nCLAIMS: []' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const ctx = makeCtx({ stream })
    const states = new Map<string, KeeperState>()
    const session = makeSession([
      { type: 'user/message', seq: 1, data: { content: 'hello' } },
      { type: 'assistant/message', seq: 2, data: { text: 'hi' } },
    ])

    arm(ctx as never, baseConfig, states, session as never, 1)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(session.append).toHaveBeenCalledTimes(1)
    const [type, payload] = session.append.mock.calls[0] as [string, { model: string }]
    expect(type).toBe('brief/prose-updated')
    expect(payload.model).toBe('antigravity/gemini-3.7-flash-tiered')
  })
})