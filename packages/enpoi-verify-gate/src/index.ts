/**
 * dsh-enpoi-verify-gate — close the observed defect where an agent ends a turn
 * claiming success while its own last verification failed.
 *
 * The plugin is a host-plane bundle: it observes the durable `session/event`
 * stream (`tool/call`, `tool/result`, `turn/end`) for every live Session and,
 * at a `completed` turn whose last verification-ish tool result failed,
 * persists one fork event `verify/unmet` with
 * `{turn, tool, callId?, exitCode?, reason, messagePreview}` and
 * `ignorable: true` (the same envelope the LLM seam's `llm/attempt-failed`
 * uses) — no released union or schema changes.
 *
 * Behaviour switch (default record-only):
 * `enpoi-orchestration.parameters.verifyGate = { mode: 'record' | 'prompt',
 * promptOnce?: boolean }` read through the settings service on every turn end
 * (hot, like the context keeper's `parameters`). In `prompt` mode the gate
 * injects ONE bounded follow-up into the same session ("your last verification
 * failed — continue or explain") and never loops: a second consecutive
 * unverified ending is recorded, not re-prompted.
 *
 * Debug visibility: `session.digest` is host-side (`packages/api/
 * session-controller` in the harness repo) and cannot be extended from this
 * profile, so the gate reports each unmet turn into the existing diagnostics
 * service as a `client` incident (`kind: 'verify-unmet'` via the diagnostics
 * `report` seam) — `session_debug`'s `incidents` section already folds that
 * tail, no edits to `enpoi-debug` required.
 *
 * Everything is fail-open: a failure inside the gate is logged and swallowed;
 * it never blocks a turn, an append, or another plugin.
 *
 * @module dsh-enpoi-verify-gate
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Schema from 'schemastery'
import {
  observeToolResult,
  VERIFY_UNMET_EVENT,
  VerifyGateTracker,
  type GateConfig,
  type ToolResultFacts,
  type VerifyUnmetRecord,
} from './verify.js'

/** Cordis plugin name. */
export const name = 'enpoi-verify-gate'

/** Nothing is required at plugin scope: the gate attaches even on a bare tree. */
export const inject: string[] = []

/** Plugin configuration (schemastery-validated by the loader). */
export interface Config {
  /** Fallback mode when settings carry no `parameters.verifyGate` (default `record`). */
  mode?: 'record' | 'prompt'
  /** Fallback one-ever prompt cap when settings carry none (default false). */
  promptOnce?: boolean
}

/** Schemastery validator for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  mode: Schema.union(['record', 'prompt'] as const).default('record'),
  promptOnce: Schema.boolean().default(false),
})

/** Settings namespace + path owning the runtime switch. */
export const GATE_SETTINGS_NAMESPACE = 'enpoi-orchestration'

/** Hard cap on remembered `tool/call` ids per session stream. */
const MAX_REMEMBERED_CALLS = 500

/** Injectable seams (tests); production defaults read the live services. */
export interface ApplyOptions {
  /** Clock-free defer hook; defaults to `setTimeout(…, 0)`. */
  readonly defer?: (task: () => void) => void
}

const FOLLOWUP_PREFIX =
  'Your last verification failed — continue the work or explain why the turn is done.'

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * Resolve the gate config for one turn end: settings
 * (`enpoi-orchestration.parameters.verifyGate`) over the plugin Config,
 * defaulting to record-only. Reads are hot per event; any failure falls back.
 * @param ctx - owning context.
 * @param config - plugin config fallback.
 * @returns the resolved mode and prompt cap.
 */
export function resolveGateConfig(ctx: Context, config: Config = {}): GateConfig {
  const fallback: GateConfig = {
    mode: config.mode === 'prompt' ? 'prompt' : 'record',
    promptOnce: config.promptOnce === true,
  }
  try {
    const settings = ctx.get('settings') as
      | { get?: (ns: string) => { parameters?: { verifyGate?: { mode?: unknown; promptOnce?: unknown } } } | undefined }
      | undefined
    const gate = settings?.get?.(GATE_SETTINGS_NAMESPACE)?.parameters?.verifyGate
    if (gate === null || typeof gate !== 'object') return fallback
    return {
      mode: gate.mode === 'prompt' ? 'prompt' : gate.mode === 'record' ? 'record' : fallback.mode,
      promptOnce: typeof gate.promptOnce === 'boolean' ? gate.promptOnce : fallback.promptOnce,
    }
  } catch {
    return fallback
  }
}

/** Structural `tool/result` payload facts (plugin events are read by name). */
export function extractToolResultFacts(data: Record<string, unknown>): ToolResultFacts & { turn?: number } {
  const message = asRecord(data.message)
  const source = asRecord(message?.source)
  const callIdRaw = typeof data.callId === 'string' ? data.callId : source?.callId
  const callId = typeof callIdRaw === 'string' && callIdRaw !== '' ? callIdRaw : undefined
  const turn = typeof data.turn === 'number' && Number.isFinite(data.turn) ? Math.trunc(data.turn) : undefined
  let isError: boolean | undefined
  const texts: string[] = []
  const content = Array.isArray(message?.content) ? message.content : []
  for (const blockRaw of content) {
    const block = asRecord(blockRaw)
    if (block === undefined || block.type !== 'tool-result') continue
    if (typeof block.isError === 'boolean') isError = block.isError
    const inner = Array.isArray(block.content) ? block.content : []
    for (const partRaw of inner) {
      const part = asRecord(partRaw)
      if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text)
    }
  }
  return {
    ...(turn === undefined ? {} : { turn }),
    ...(callId === undefined ? {} : { callId }),
    ...(isError === undefined ? {} : { isError }),
    text: texts.join('\n'),
    error: data.error,
    meta: data.meta,
  }
}

/** Append one `ignorable` fork event through the structural Session sink. */
export function appendIgnorable(session: unknown, type: string, data: unknown): void {
  const append = (session as { append?: (type: string, data: unknown, opts?: { ignorable?: true }) => unknown } | undefined)?.append
  if (typeof append !== 'function') return
  append.call(session, type, data, { ignorable: true })
}

/** Fold one unmet turn into the diagnostics tail the debug surface already reads. */
function reportIncident(
  ctx: Context,
  record: VerifyUnmetRecord,
  sessionId: string,
): string | undefined {
  try {
    const diagnostics = ctx.get('diagnostics') as
      | { report?: (request: { kind?: string; message?: string; sessionId?: string }) => { code?: string } }
      | undefined
    if (typeof diagnostics?.report !== 'function') return undefined
    const exit = record.exitCode === undefined ? '' : ` exitCode=${String(record.exitCode)}`
    const result = diagnostics.report({
      kind: 'verify-unmet',
      message: `verify/unmet: ${record.tool} ${record.reason}${exit} turn=${record.turn} ${record.messagePreview}`,
      sessionId,
    })
    return typeof result?.code === 'string' ? result.code : undefined
  } catch {
    return undefined
  }
}

/** Inject the one bounded follow-up turn (prompt mode only). */
function injectFollowup(ctx: Context, sessionId: string, record: VerifyUnmetRecord): boolean {
  try {
    const agents = ctx.get('agents') as
      | { get?: (id: string) => { followup?: (message: unknown) => void } | undefined }
      | undefined
    const agent = agents?.get?.(sessionId)
    if (agent === undefined || typeof agent.followup !== 'function') return false
    const exit = record.exitCode === undefined ? '' : ` (${record.tool}, exit ${String(record.exitCode)})`
    const message = createUserMessage({
      content: [{ type: 'text', text: `${FOLLOWUP_PREFIX}${exit}` }],
      source: {
        kind: 'plugin',
        plugin: 'enpoi-verify-gate',
        form: 'notice',
        summary: `verification unmet (${record.tool})`,
      },
    })
    agent.followup(message)
    return true
  } catch (error: unknown) {
    process.stderr.write(`[enpoi-verify-gate] follow-up injection failed: ${errorText(error)}\n`)
    return false
  }
}

/** Persist, log, report, and (prompt mode) inject for one decided unmet turn. */
function deliver(ctx: Context, session: unknown, record: VerifyUnmetRecord, prompt: boolean): void {
  const sessionId = (session as { id?: unknown })?.id
  const id = typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'unknown'
  const exit = record.exitCode === undefined ? '' : ` exitCode=${String(record.exitCode)}`
  const line = `verify/unmet session=${id} turn=${record.turn} tool=${record.tool} reason=${record.reason}${exit} preview="${record.messagePreview}"`
  try {
    appendIgnorable(session, VERIFY_UNMET_EVENT, record)
  } catch (error: unknown) {
    process.stderr.write(`[enpoi-verify-gate] append failed: ${errorText(error)}\n`)
  }
  // The plugin's own log line: stderr is the load/proof surface (the harness
  // logger may route elsewhere), one ordinary info line rides the logger.
  process.stderr.write(`[enpoi-verify-gate] ${line}\n`)
  try {
    ctx.logger?.info?.(`enpoi-verify-gate: ${line}`)
  } catch {
    // Logging must never take the gate down.
  }
  const code = reportIncident(ctx, record, id)
  if (code !== undefined) {
    process.stderr.write(`[enpoi-verify-gate] reported diagnostics incident ${code} for ${id}\n`)
  }
  if (prompt) {
    const injected = injectFollowup(ctx, id, record)
    process.stderr.write(
      `[enpoi-verify-gate] prompt mode: follow-up ${injected ? 'injected' : 'not injected (no live agent)'} for ${id}\n`,
    )
  }
}

/** One structural `session/event` payload (plugin-extended events read by name). */
interface EventLike {
  readonly type: string
  readonly data?: unknown
}

/**
 * Mount the gate. Every path is fail-open: a listener failure is logged and
 * swallowed, never thrown into the harness.
 * @param ctx - owning context.
 * @param config - optional plugin configuration.
 * @param options - test seams (defer hook).
 */
export function apply(ctx: Context, config: Config = {}, options: ApplyOptions = {}): void {
  try {
    const tracker = new VerifyGateTracker()
    const calls = new Map<string, string>()
    const defer = options.defer ?? ((task: () => void): void => {
      const timer = setTimeout(task, 0)
      timer.unref?.()
    })

    const listener = (session: { readonly id?: unknown }, event: EventLike): void => {
      try {
        const data = asRecord(event.data) ?? {}
        switch (event.type) {
          case 'tool/call': {
            const callId = typeof data.callId === 'string' ? data.callId : undefined
            const tool = typeof data.name === 'string' && data.name !== '' ? data.name : 'unknown'
            if (callId === undefined) return
            calls.set(callId, tool)
            if (calls.size > MAX_REMEMBERED_CALLS) {
              const oldest = calls.keys().next().value
              if (oldest !== undefined) calls.delete(oldest)
            }
            return
          }
          case 'tool/result': {
            const facts = extractToolResultFacts(data)
            const callId = typeof facts.callId === 'string' ? facts.callId : undefined
            const sessionId = typeof session.id === 'string' && session.id !== '' ? session.id : undefined
            if (sessionId === undefined) return
            tracker.noteToolResult(sessionId, observeToolResult({
              ...facts,
              ...(callId === undefined ? {} : { tool: calls.get(callId) }),
            }))
            return
          }
          case 'turn/end': {
            const sessionId = typeof session.id === 'string' && session.id !== '' ? session.id : undefined
            const turn = typeof data.turn === 'number' && Number.isFinite(data.turn) ? Math.trunc(data.turn) : undefined
            if (sessionId === undefined || turn === undefined) return
            const reasonRecord = asRecord(data.reason)
            const reason = typeof reasonRecord?.kind === 'string' ? reasonRecord.kind : 'unknown'
            const decision = tracker.noteTurnEnd({
              sessionId,
              turn,
              reason,
              config: resolveGateConfig(ctx, config),
            })
            if (decision.record === undefined) return
            const { record, prompt } = decision
            // Defer out of append publication: this listener runs inside
            // `Session.append`, and a nested append/`followup` would trip the
            // engine's re-entry guard (same reason enpoi-cascade defers).
            defer(() => { deliver(ctx, session, record, prompt) })
            return
          }
          default:
            return
        }
      } catch (error: unknown) {
        process.stderr.write(`[enpoi-verify-gate] listener failure swallowed: ${errorText(error)}\n`)
      }
    }

    ctx.on('session/event', listener as never)
    process.stderr.write(
      `[enpoi-verify-gate] mounted (mode=${config.mode ?? 'record'} fallback; switch: ${GATE_SETTINGS_NAMESPACE}.parameters.verifyGate)\n`,
    )
    ctx.logger?.info?.(
      `enpoi-verify-gate: mounted (record-only unless ${GATE_SETTINGS_NAMESPACE}.parameters.verifyGate sets mode=prompt)`,
    )
  } catch (error: unknown) {
    process.stderr.write(`[enpoi-verify-gate] disabled — ${errorText(error)}\n`)
  }
}

export {
  observeToolResult,
  previewFailureText,
  readExitCode,
  VerifyGateTracker,
  DEFAULT_GATE_CONFIG,
  FAILURE_TEXT_PATTERN,
  MAX_TRACKED_SESSIONS,
  PREVIEW_CHARS,
  VERIFICATION_TOOLS,
  VERIFY_UNMET_EVENT,
  type GateConfig,
  type GateSessionState,
  type ToolResultFacts,
  type TurnEndDecision,
  type TurnEndInput,
  type VerifyFailure,
  type VerifyFailureReason,
  type VerifyGateMode,
  type VerifyObservation,
  type VerifyUnmetRecord,
} from './verify.js'
