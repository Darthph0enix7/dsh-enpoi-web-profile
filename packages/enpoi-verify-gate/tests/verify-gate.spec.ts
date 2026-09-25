import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  extractToolResultFacts,
  resolveGateConfig,
  apply,
  type ApplyOptions,
  type Config,
} from '../src/index.js'
import {
  observeToolResult,
  previewFailureText,
  readExitCode,
  VerifyGateTracker,
  VERIFY_UNMET_EVENT,
  type ToolResultFacts,
} from '../src/verify.js'

/**
 * The live `tool/result` payload shape observed in a real session log:
 * call id nested under `message.source`, structured outcome under `meta`,
 * `isError` on the tool-result block.
 */
function liveBashResult(overrides: {
  exitCode?: number | null
  isError?: boolean
  text?: string
  error?: unknown
  turn?: number
  omitMeta?: boolean
} = {}): Record<string, unknown> {
  const {
    exitCode = 1,
    isError = false,
    text = 'FAILED test_cart.py::test_total - assert [] == [7]\n[exit code: 1]',
    error,
    turn = 1,
    omitMeta = false,
  } = overrides
  return {
    turn,
    step: 1,
    message: {
      source: { kind: 'tool', callId: 'call_1' },
      content: [{
        type: 'tool-result',
        toolCallId: 'call_1',
        content: [{ type: 'text', text }],
        isError,
      }],
      role: 'user',
      id: 'msg_1',
    },
    ...(omitMeta ? {} : { meta: { exitCode } }),
    ...(error === undefined ? {} : { error }),
    sourceEventSeqs: [1],
    surfaceOp: 'append',
  }
}

function facts(data: Record<string, unknown>, tool = 'bash'): ToolResultFacts {
  return { ...extractToolResultFacts(data), tool }
}

describe('failure classification', () => {
  it('classifies a live bash exit 1 result as an exit-code failure', () => {
    const observation = observeToolResult(facts(liveBashResult()))
    expect(observation?.failure).toMatchObject({
      turn: 1,
      tool: 'bash',
      callId: 'call_1',
      exitCode: 1,
      reason: 'exit-code',
    })
    expect(observation?.failure?.messagePreview).toContain('assert [] == [7]')
    expect(observation?.failure?.messagePreview).not.toContain('[exit code: 1]')
  })

  it('treats a clean exit 0 as "verified" (no failure)', () => {
    const observation = observeToolResult(facts(liveBashResult({ exitCode: 0, text: '1 passed' })))
    expect(observation).toEqual({ turn: 1 })
    expect(observation?.failure).toBeUndefined()
  })

  it('treats a signal-killed command (exitCode null) as a failure', () => {
    const observation = observeToolResult(facts(liveBashResult({ exitCode: null, text: '[killed by signal: SIGKILL]' })))
    expect(observation?.failure).toMatchObject({ reason: 'exit-code', exitCode: null })
  })

  it('ignores non-verification tools with no structured facts', () => {
    const readResult = {
      turn: 1,
      message: { source: { kind: 'tool', callId: 'call_9' }, content: [{ type: 'tool-result', toolCallId: 'call_9', content: [{ type: 'text', text: 'file contents' }], isError: false }] },
    }
    expect(observeToolResult(facts(readResult, 'read'))).toBeUndefined()
  })

  it('classifies isError results as failures', () => {
    const observation = observeToolResult(facts(liveBashResult({ exitCode: 0, isError: true, text: 'spawn failed' })))
    expect(observation?.failure).toMatchObject({ reason: 'is-error' })
  })

  it('classifies a structured error on any tool as a failure', () => {
    const errorResult = {
      turn: 2,
      error: { name: 'ToolError', code: 'TOOL_FAILED', reason: 'tool exploded' },
      message: { source: { kind: 'tool', callId: 'call_3' }, content: [{ type: 'tool-result', toolCallId: 'call_3', content: [{ type: 'text', text: 'tool exploded' }], isError: true }] },
    }
    const observation = observeToolResult(facts(errorResult, 'some_future_tool'))
    expect(observation?.failure).toMatchObject({ reason: 'tool-error', tool: 'some_future_tool', turn: 2 })
    expect(observation?.failure?.messagePreview).toBe('tool exploded')
  })

  it('falls back to recognised failure text when the result carries no facts', () => {
    const textOnly = {
      turn: 1,
      message: { source: { kind: 'tool', callId: 'call_4' }, content: [{ type: 'tool-result', toolCallId: 'call_4', content: [{ type: 'text', text: 'Traceback (most recent call last):\nAssertionError: boom' }], isError: false }] },
    }
    expect(observeToolResult(facts(textOnly))?.failure).toMatchObject({ reason: 'failure-text' })
    expect(observeToolResult(facts(liveBashResult({ exitCode: 0, omitMeta: true, text: 'AssertionError: boom' })))?.failure)
      .toMatchObject({ reason: 'failure-text' })
    expect(observeToolResult(facts(liveBashResult({ exitCode: 0, omitMeta: true, text: 'everything is fine' })))?.failure)
      .toBeUndefined()
  })

  it('reads exit codes and bounds previews', () => {
    expect(readExitCode({ exitCode: 0 })).toBe(0)
    expect(readExitCode({ exitCode: null })).toBeNull()
    expect(readExitCode({})).toBeUndefined()
    expect(readExitCode('nope')).toBeUndefined()
    const long = `FAILED ${'x'.repeat(500)}`
    const preview = previewFailureText(long)
    expect(preview.length).toBeLessThanOrEqual(200)
    expect(preview.endsWith('…')).toBe(true)
    expect(previewFailureText(undefined)).toBe('')
  })
})

describe('turn-end decision (record mode)', () => {
  it('records exactly once for a failing-last-tool + completed turn', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult())))
    const decision = tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: { mode: 'record', promptOnce: false } })
    expect(decision.record).toMatchObject({
      turn: 1,
      tool: 'bash',
      callId: 'call_1',
      exitCode: 1,
      reason: 'exit-code',
    })
    expect(decision.record?.messagePreview).toContain('assert [] == [7]')
    expect(decision.prompt).toBe(false)
    // The per-turn failure is consumed: a duplicate boundary cannot double-record.
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: { mode: 'record', promptOnce: false } }).record)
      .toBeUndefined()
  })

  it('records nothing on a clean turn', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ exitCode: 0, text: '1 passed' }))))
    const decision = tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: { mode: 'record', promptOnce: false } })
    expect(decision.record).toBeUndefined()
    expect(decision.prompt).toBe(false)
  })

  it('records nothing when a later verification passes after a failure', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult())))
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ exitCode: 0, text: '1 passed' }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: { mode: 'record', promptOnce: false } }).record)
      .toBeUndefined()
  })

  it('records nothing for aborted or error turn endings', () => {
    for (const reason of ['aborted', 'error', 'blocked', 'max-tokens', 'interrupted']) {
      const tracker = new VerifyGateTracker()
      tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult())))
      const decision = tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason, config: { mode: 'record', promptOnce: false } })
      expect(decision.record).toBeUndefined()
      expect(decision.prompt).toBe(false)
    }
  })

  it('never records a failure from a different turn', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 1 }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 2, reason: 'completed', config: { mode: 'record', promptOnce: false } }).record)
      .toBeUndefined()
  })
})

describe('prompt mode', () => {
  const promptConfig = { mode: 'prompt' as const, promptOnce: false }

  it('injects exactly once and never on a second consecutive unverified turn', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 1 }))))
    const first = tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: promptConfig })
    expect(first.record).toBeDefined()
    expect(first.prompt).toBe(true)
    expect(tracker.noteToolResult).not.toThrow()

    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 2 }))))
    const second = tracker.noteTurnEnd({ sessionId: 's1', turn: 2, reason: 'completed', config: promptConfig })
    expect(second.record).toBeDefined()
    expect(second.prompt).toBe(false)

    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 3 }))))
    const third = tracker.noteTurnEnd({ sessionId: 's1', turn: 3, reason: 'completed', config: promptConfig })
    expect(third.prompt).toBe(false)
  })

  it('resets the streak after a verified turn', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 1 }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: promptConfig }).prompt).toBe(true)
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 2, exitCode: 0, text: '1 passed' }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 2, reason: 'completed', config: promptConfig }).prompt).toBe(false)
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 3 }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 3, reason: 'completed', config: promptConfig }).prompt).toBe(true)
  })

  it('honours promptOnce across streaks', () => {
    const tracker = new VerifyGateTracker()
    const config = { mode: 'prompt' as const, promptOnce: true }
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 1 }))))
    expect(tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config }).prompt).toBe(true)
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 2, exitCode: 0, text: 'ok' }))))
    tracker.noteTurnEnd({ sessionId: 's1', turn: 2, reason: 'completed', config })
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult({ turn: 3 }))))
    const decision = tracker.noteTurnEnd({ sessionId: 's1', turn: 3, reason: 'completed', config })
    expect(decision.record).toBeDefined()
    expect(decision.prompt).toBe(false)
  })

  it('record mode never prompts', () => {
    const tracker = new VerifyGateTracker()
    tracker.noteToolResult('s1', observeToolResult(facts(liveBashResult())))
    const decision = tracker.noteTurnEnd({ sessionId: 's1', turn: 1, reason: 'completed', config: { mode: 'record', promptOnce: false } })
    expect(decision.record).toBeDefined()
    expect(decision.prompt).toBe(false)
  })
})

describe('settings switch', () => {
  function ctxWith(gate: unknown, present = true): Context {
    return {
      get: (name: string) => name === 'settings'
        ? (present ? { get: () => ({ parameters: { verifyGate: gate } }) } : undefined)
        : undefined,
    } as unknown as Context
  }

  it('defaults to record-only when settings or the namespace are absent', () => {
    expect(resolveGateConfig(ctxWith(undefined, false), {})).toEqual({ mode: 'record', promptOnce: false })
    expect(resolveGateConfig(ctxWith(undefined), {})).toEqual({ mode: 'record', promptOnce: false })
  })

  it('reads enpoi-orchestration.parameters.verifyGate over the plugin config', () => {
    expect(resolveGateConfig(ctxWith({ mode: 'prompt', promptOnce: true }), { mode: 'record' }))
      .toEqual({ mode: 'prompt', promptOnce: true })
    expect(resolveGateConfig(ctxWith({ mode: 'nonsense' }), { mode: 'prompt' }))
      .toEqual({ mode: 'prompt', promptOnce: false })
  })

  it('falls back on a throwing settings service', () => {
    const ctx = { get: () => ({ get: () => { throw new Error('locked') } }) } as unknown as Context
    expect(resolveGateConfig(ctx, { mode: 'prompt' })).toEqual({ mode: 'prompt', promptOnce: false })
  })
})

describe('plugin wiring', () => {
  interface Harness {
    ctx: Context
    session: { id: string; append: (type: string, data: unknown, opts?: { ignorable?: true }) => void }
    appended: Array<{ type: string; data: any; opts?: { ignorable?: true } }>
    followups: unknown[]
    reports: Array<{ kind?: string; message?: string; sessionId?: string }>
    emit: (type: string, data: unknown) => void
  }

  function harness(config: Config = {}, gate?: { mode?: string; promptOnce?: boolean }, deferImmediate = true): Harness {
    const listeners: Array<(session: unknown, event: unknown) => void> = []
    const appended: Harness['appended'] = []
    const followups: unknown[] = []
    const reports: Harness['reports'] = []
    const session = {
      id: 'session-wire-1',
      append: (type: string, data: unknown, opts?: { ignorable?: true }) => { appended.push({ type, data, opts }) },
    }
    const ctx = {
      on: (name: string, listener: (session: unknown, event: unknown) => void) => {
        if (name === 'session/event') listeners.push(listener)
        return () => {}
      },
      get: (name: string) => {
        if (name === 'settings') return gate === undefined ? undefined : { get: () => ({ parameters: { verifyGate: gate } }) }
        if (name === 'agents') return { get: () => ({ followup: (message: unknown) => { followups.push(message) } }) }
        if (name === 'diagnostics') return { report: (request: Harness['reports'][number]) => { reports.push(request); return { code: 'D123456' } } }
        return undefined
      },
      logger: { info: () => {}, warn: () => {} },
    } as unknown as Context
    const options: ApplyOptions = deferImmediate ? { defer: (task: () => void) => task() } : {}
    apply(ctx, config, options)
    return {
      ctx,
      session,
      appended,
      followups,
      reports,
      emit: (type: string, data: unknown) => { for (const listener of listeners) listener(session, { type, data }) },
    }
  }

  function drive(harness: Harness, turn: number, result: Record<string, unknown>): void {
    harness.emit('tool/call', { turn, step: 1, callId: 'call_1', name: 'bash', arguments: '{}' })
    harness.emit('tool/result', result)
    harness.emit('turn/end', { turn, reason: { kind: 'completed' } })
  }

  it('records a live-shaped failing bash result once and reports it to diagnostics', () => {
    const h = harness()
    drive(h, 1, liveBashResult())
    expect(h.appended).toHaveLength(1)
    expect(h.appended[0]?.type).toBe(VERIFY_UNMET_EVENT)
    expect(h.appended[0]?.opts).toEqual({ ignorable: true })
    expect(h.appended[0]?.data).toMatchObject({ turn: 1, tool: 'bash', callId: 'call_1', exitCode: 1, reason: 'exit-code' })
    expect(h.appended[0]?.data.messagePreview).toContain('assert [] == [7]')
    expect(h.followups).toHaveLength(0)
    expect(h.reports).toHaveLength(1)
    expect(h.reports[0]?.kind).toBe('verify-unmet')
    expect(h.reports[0]?.sessionId).toBe('session-wire-1')
  })

  it('records nothing for a clean or an error turn', () => {
    const clean = harness()
    drive(clean, 1, liveBashResult({ exitCode: 0, text: '1 passed' }))
    expect(clean.appended).toHaveLength(0)

    const errored = harness()
    errored.emit('tool/call', { turn: 1, step: 1, callId: 'call_1', name: 'bash', arguments: '{}' })
    errored.emit('tool/result', liveBashResult())
    errored.emit('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'X', message: 'boom' } } })
    expect(errored.appended).toHaveLength(0)
  })

  it('prompt mode injects exactly one follow-up and never on the second unverified turn', () => {
    const h = harness({}, { mode: 'prompt' })
    drive(h, 1, liveBashResult({ turn: 1 }))
    drive(h, 2, liveBashResult({ turn: 2 }))
    expect(h.appended).toHaveLength(2)
    expect(h.followups).toHaveLength(1)
    const message = h.followups[0] as { role?: string; content?: Array<{ text?: string }>; source?: { kind?: string } }
    expect(message.role).toBe('user')
    expect(message.content?.[0]?.text).toContain('Your last verification failed')
    expect(message.source?.kind).toBe('enpoi-verify-gate')
  })

  it('defers delivery out of append publication', () => {
    const h = harness()
    const deferred: Array<() => void> = []
    const ctx = {
      on: (name: string, listener: (session: unknown, event: unknown) => void) => {
        if (name === 'session/event') (h as any).listener = listener
        return () => {}
      },
      get: () => undefined,
      logger: { info: () => {} },
    } as unknown as Context
    apply(ctx, {}, { defer: (task) => { deferred.push(task) } })
    const listener = (h as any).listener as (session: unknown, event: unknown) => void
    listener(h.session, { type: 'tool/call', data: { callId: 'call_1', name: 'bash' } })
    listener(h.session, { type: 'tool/result', data: liveBashResult() })
    listener(h.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
    expect(h.appended).toHaveLength(0)
    expect(deferred).toHaveLength(1)
    deferred[0]?.()
    expect(h.appended).toHaveLength(1)
  })

  it('uses the plugin config fallback when settings are absent', () => {
    const h = harness({ mode: 'prompt' })
    drive(h, 1, liveBashResult())
    expect(h.followups).toHaveLength(1)
  })
})
