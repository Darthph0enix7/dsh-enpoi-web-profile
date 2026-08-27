/**
 * Enpoi Harness Context Keeper — the silent background prose worker (doc 31 §7).
 *
 * Subscribes to `session/event`, reacts ONLY to `turn/end` milestones
 * (roundtable: milestone heuristics are YAGNI), debounces (config default
 * 15s, deployed profile 30s), single-flight per session, 45s hard lease
 * (doc 35 §4.3). Summarizes the recent turn with a flash-tier model
 * (primary + one fallback, soft-degrading — never blocks the session), then
 * appends `brief/prose-updated` via `session.append`. The primary route is
 * resolved per wake from `enpoi-orchestration.personas.keeper` when assigned,
 * else the plugin Config route.
 *
 * Deadlock discipline (Oracle): the turn/end listener NEVER appends
 * synchronously — it only arms the debounce timer. The append happens on a
 * clean stack after the LLM resolves, so `session.append`'s non-reentrant
 * guard can never trip. Self-ignore: the keeper's own appends emit
 * `brief/prose-updated` (not `turn/end`), so they cannot re-arm the
 * subscription — the origin filter is defense-in-depth insurance.
 *
 * @module dsh-enpoi-context-keeper
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { BlockAssembler, createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { appendFileSync, mkdirSync } from 'node:fs'
import { openMemoryDb } from '../../enpoi-memory/src/db'
import { makePipeline } from '../../enpoi-memory/src/pipeline'
import { join } from 'node:path'
import Schema from 'schemastery'

export const name = 'enpoi-context-keeper'

/** The llm service is required — the keeper is a model-backed worker. */
export const inject = ['llm']

/** Minimal file diagnostics — the Cordis logger only buffers (no console sink). */
function diag(line: string): void {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? '/tmp'
    const dir = join(home.endsWith('.dsh') ? home : join(home, '.dsh'), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'enpoi-keeper.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // diagnostics must never break the keeper
  }
}

export interface Config {
  provider?: string
  model?: string
  fallbackProvider?: string
  fallbackModel?: string
  debounceMs?: number
  leaseMs?: number
  maxInputEvents?: number
  maxOutputTokens?: number
}

export const Config = Schema.object({
  provider: Schema.string().default('freellmapi'),
  model: Schema.string().default('auto'),
  fallbackProvider: Schema.string().default('antigravity'),
  fallbackModel: Schema.string().default('gemini-3.7-flash-tiered'),
  debounceMs: Schema.number().default(15_000),
  leaseMs: Schema.number().default(45_000),
  maxInputEvents: Schema.number().default(80),
  maxOutputTokens: Schema.number().default(2048),
})

/** Secrets-exclusion instruction (doc 35 §1.1) — summarization never credentials. */
const SYSTEM_PROMPT = [
  'You are the Enpoi Harness context keeper — the master background summarizer and architectural keeper for this coding session.',
  'You maintain a running, concise, and highly accurate Living Brief of the session for later dispatch to subagent workers, the Oracle, Council debaters, and permanent memory.',
  'If a [PREVIOUS SESSION BRIEF] is provided, incrementally merge it with the [RECENT SESSION EVENTS & TOOL RESULTS] (including Council/Roundtable consensus, Oracle verdicts, subagent returns, tool results, documentation paths, and user directives).',
  'NEVER extract, repeat, or retain credentials, passwords, API keys, tokens, or personal secrets.',
  '',
  'CRITICAL SECTION DISCIPLINE (ZERO-FILLER RULE):',
  '- ONLY include a section if there is genuine, substantive information established in the session.',
  '- If no documentation files were created or referenced, DO NOT emit the 📚 section and NEVER write "No documentation...".',
  '- If no approaches were debated/rejected, DO NOT emit the 🚫 section and NEVER write "No alternative approaches...".',
  '- If there are no open blockers, DO NOT emit the ⚡ section and NEVER write "No blockers remain...".',
  '- For simple queries, greetings, or health-checks (e.g. ping), emit ONLY a single-line 🎯 ACTIVE GOAL or keep the brief empty. NEVER invent placeholder bullets.',
  '',
  'You have ONE background tool: memory_save. Use it via the CLAIMS block below.',
  '',
  'Output EXACTLY two blocks, IN THIS ORDER (no other text at all):',
  '',
  'BLOCK 1 — PROSE:',
  'Use ONLY the relevant section headers from below (omit any section with no substantive content):',
  '🎯 ACTIVE GOAL & CORE TRAJECTORY:',
  '- Current active objective, user directives, and high-level technical paradigms.',
  '',
  '📚 DOCUMENTATION & SPECIFICATIONS INVENTORY:',
  '- List documentation, plans, architectures, and spec files written, modified, or referenced in the session with a 1-line summary.',
  '',
  '🏛️ ARCHITECTURAL INVARIANTS & CONCRETE DECISIONS:',
  '- Concrete technical decisions established in the session: exact component boundaries, protocols (IPC/HTTP/WS/Redis), data keys/schemas, state machines, and concurrency rules.',
  '',
  '🚫 REJECTED APPROACHES & EDGE CASES:',
  '- Approaches debated and explicitly ruled out (and reasons why), edge cases handled, and failure modes defended.',
  '',
  '⚡ ACTIVE BLOCKERS & OPEN QUESTIONS:',
  '- Unresolved technical questions, pending implementation tasks, or immediate next steps.',
  '',
  'BLOCK 2 — CLAIMS:',
  'A line starting with "CLAIMS:" followed by a JSON array of permanent facts you are SAVING to memory.db: [{"fact":"...","category":"ARCHITECTURE","tags":"..."}]',
  '  - File 2–4 durable facts about Adam\'s environment/infrastructure/architecture whenever the session surfaces them.',
  '  - Categories limited to ARCHITECTURE, CONFIG_VALUES, or PROJECT.',
  '  - If no new permanent facts emerged, emit "CLAIMS: []".',
  '  - NO credentials/passwords/tokens/secrets; skip transient chatter.',
].join('\n')

/** Per-session keeper state: debounce timer + single-flight + lease. */
export interface KeeperState {
  timer: NodeJS.Timeout | null
  running: boolean
  /** A turn ended while a pass was in flight — schedule a trailing re-run. */
  rerunRequested: boolean
  turn: number
}

/** Resolved model route for one keeper wake (Oracle: resolve once per run, never inside executeRoute). */
interface ResolvedRoute {
  provider: string
  model: string
  fallbackProvider: string
  fallbackModel: string
  reasoningEffort?: string
}

/**
 * Resolve the keeper's model route for this wake.
 *
 * Precedence (Oracle amendment): `enpoi-orchestration.personas.keeper` (operator
 * assignment) > plugin Config primary/fallback. The fallback route is constant
 * in both branches. Partial entries (missing provider or model) are ignored.
 */
export function resolveKeeperRoute(ctx: Context, config: Config): ResolvedRoute {
  const fallbackProvider = config.fallbackProvider ?? 'antigravity'
  const fallbackModel = config.fallbackModel ?? 'gemini-3.7-flash-tiered'
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => { personas?: Record<string, { provider?: string; model?: string; reasoningEffort?: string }> } } | undefined
    const entry = settings?.get?.('enpoi-orchestration')?.personas?.['keeper']
    if (entry && entry.provider && entry.model) {
      return {
        provider: entry.provider,
        model: entry.model,
        fallbackProvider,
        fallbackModel,
        ...(entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}),
      }
    }
  } catch {
    // settings unavailable — fall through to config defaults
  }
  return {
    provider: config.provider ?? 'freellmapi',
    model: config.model ?? 'auto',
    fallbackProvider,
    fallbackModel,
  }
}

export function apply(ctx: Context, config: Config): void {
  const states = new Map<string, KeeperState>()
  diag(`apply: mounted (provider=${config.provider}/${config.model}, debounce=${config.debounceMs}ms, lease=${config.leaseMs}ms)`)

  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (event.type !== 'turn/end') return
    const reason = (event.data as { reason: { kind: string } }).reason
    if (reason.kind === 'aborted') return // don't summarize interrupted turns
    diag(`turn/end: session=${session.id} turn=${(event.data as { turn: number }).turn} reason=${reason.kind} — arming`)
    arm(ctx, config, states, session, (event.data as { turn: number }).turn)
  })

  ctx.on('dispose', () => {
    for (const state of states.values()) {
      if (state.timer !== null) clearTimeout(state.timer)
    }
    states.clear()
  })
}

/** Arm (or re-arm) the debounce for one session. Never appends synchronously. */
export function arm(
  ctx: Context,
  config: Config,
  states: Map<string, KeeperState>,
  session: Session,
  turn: number,
): void {
  const key = session.id
  let state = states.get(key)
  if (state === undefined) {
    // Create the per-session state object ONCE and mutate it afterwards —
    // replacing it while a run() holds the old reference wedges the keeper
    // (the in-flight run resets `running` on the stale object, never this one).
    state = { timer: null, running: false, rerunRequested: false, turn }
    states.set(key, state)
  }
  if (state.timer !== null) clearTimeout(state.timer)
  state.turn = turn
  state.timer = setTimeout(() => {
    state!.timer = null
    void run(ctx, config, states, session, turn)
  }, config.debounceMs)
}

/** One keeper pass: single-flight, lease-bound LLM call, then append. */
export async function run(
  ctx: Context,
  config: Config,
  states: Map<string, KeeperState>,
  session: Session,
  turn: number,
): Promise<void> {
  const key = session.id
  const state = states.get(key)
  if (state === undefined) return
  state.timer = null
  if (state.running) {
    // A turn ended while a pass is in flight — latch a trailing re-run so the
    // newest events are never dropped (Oracle wedge fix: the in-flight run's
    // finally block schedules the trailing pass).
    state.rerunRequested = true
    return
  }
  state.running = true

  const lease = new AbortController()
  const leaseTimer = setTimeout(() => lease.abort(), config.leaseMs)
  try {
    const input = frameInput(session, config.maxInputEvents)
    if (input.length === 0) {
      diag(`run: session=${session.id} turn=${turn} — empty input, skipping`)
      return
    }
    // Resolve the model route ONCE per wake, at entry (Oracle: never inside
    // executeRoute — one coherent primary/fallback pair per wake).
    const route = resolveKeeperRoute(ctx, config)
    diag(`run: session=${session.id} turn=${turn} — calling LLM (input ${input.length} chars, route ${route.provider}/${route.model})`)
    // Capture the input's snapshot seq BEFORE the async LLM call — events
    // landing during the call must not shift basedOnSeq forward (I3 causal
    // ordering: a stale summary must never look fresher than a steered goal).
    const snapshotSeq = session.events.at(-1)?.seq ?? session.seq
    const result = await summarize(ctx, config, session, input, lease.signal, route)
    if (result.text.length === 0) {
      diag(`run: session=${session.id} turn=${turn} — empty summary, skipping`)
      return
    }
    // A3.5 isolation: split PROSE + CLAIMS (malformed claims never block prose).
    diag(`run: session=${session.id} turn=${turn} — raw output: ${result.text.slice(0, 1200).replace(/\n/g, ' | ')}`)
    const { prose: rawProse, claims } = splitProseClaims(result.text)
    const prose = cleanKeeperProse(rawProse)
    if (prose.length === 0) {
      diag(`run: session=${session.id} turn=${turn} — empty or cleaned-empty prose, skipping`)
      return
    }
    // Clean stack: the LLM resolved, no append is being published.
    session.append('brief/prose-updated', {
      basedOnSeq: snapshotSeq,
      model: result.route,
      text: prose,
      origin: 'context-keeper',
    })
    diag(`run: session=${session.id} turn=${turn} — appended brief/prose-updated via ${result.route} (${prose.length} chars, ${claims.length} claims)`)
    ctx.logger.info(`enpoi-context-keeper: brief updated for session ${session.id} (turn ${turn})`)
    // Durable-claim intake (Stage 1 of the CBDC pipeline) — verified_execution,
    // auto-graduate; category boundaries enforced inside the pipeline (A3.4).
    if (claims.length > 0) {
      try {
        const memDb = openMemoryDb()
        const mem = makePipeline(memDb)
        const inserted = await mem.intake(
          claims.map(c => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: 'keeper', trust: 'verified_execution', provenance: JSON.stringify({ sessionId: session.id, turn }) },
        )
        diag(`run: session=${session.id} turn=${turn} — memory intake: ${inserted.length} claim(s) filed`)
      } catch (err) {
        diag(`run: session=${session.id} turn=${turn} — memory intake FAILED: ${String(err)}`)
      }
    }
  } catch (error) {
    if (lease.signal.aborted) {
      diag(`run: session=${session.id} turn=${turn} — KEEPER_TIMEOUT`)
      ctx.logger.warn(`enpoi-context-keeper: KEEPER_TIMEOUT session ${session.id} (turn ${turn})`)
    } else {
      diag(`run: session=${session.id} turn=${turn} — ERROR ${String(error)}`)
      ctx.logger.warn(`enpoi-context-keeper: ${String(error)} (session ${session.id}, turn ${turn})`)
    }
  } finally {
    clearTimeout(leaseTimer)
    state.running = false
    // Trailing re-run: a turn ended while we were running — schedule a fresh
    // debounced pass so the newest events get summarized (Oracle wedge fix).
    if (state.rerunRequested) {
      state.rerunRequested = false
      state.timer = setTimeout(() => {
        state!.timer = null
        void run(ctx, config, states, session, state!.turn)
      }, config.debounceMs)
    }
  }
}

/**
 * Sanitize keeper prose by stripping sections that contain ONLY negative filler / boilerplate.
 * (e.g. "No documentation...", "No alternative approaches were debated...", "No blockers remain...").
 * Keeps the brief clean, meaningful, and token-efficient.
 */
export function cleanKeeperProse(text: string): string {
  if (!text || text.trim().length === 0) return ''
  const sectionChunks = text.split(/(?=^[🎯📚🏛️🚫⚡]\s*)/m)
  const cleaned: string[] = []

  for (const chunk of sectionChunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')
    const contentLines = lines.slice(1).map(l => l.trim()).filter(Boolean)

    // If section has header but 0 content lines, omit
    if (contentLines.length === 0) continue

    // Check if every bullet in the section is just negative filler / placeholder
    const isAllNegativeFiller = contentLines.every(l =>
      /^-\s*(no\b|none\b|n\/a\b|nothing\b|not applicable\b)/i.test(l) ||
      /no documentation.*(?:created|referenced|modified|identified)/i.test(l) ||
      /no alternative approaches/i.test(l) ||
      /no blockers/i.test(l) ||
      /no open questions/i.test(l) ||
      /no edge cases/i.test(l)
    )

    if (!isAllNegativeFiller) {
      cleaned.push(trimmed)
    }
  }

  return cleaned.join('\n\n')
}

/** Split the keeper output into PROSE + CLAIMS (A3.5: claims parse is isolated). */
function splitProseClaims(text: string): {
  prose: string
  claims: Array<{ fact: string; category: string; tags?: string }>
} {
  const idx = text.indexOf('CLAIMS:')
  if (idx === -1) return { prose: text.trim(), claims: [] }
  const prose = text.slice(0, idx).replace(/^PROSE\s*:/m, '').trim()
  const jsonPart = text.slice(idx + 'CLAIMS:'.length).trim()
  try {
    const m = jsonPart.match(/\[[\s\S]*\]/)
    if (m === null) return { prose, claims: [] }
    const arr: unknown = JSON.parse(m[0])
    if (!Array.isArray(arr)) return { prose, claims: [] }
    const claims = arr
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).fact === 'string')
      .map(c => ({
        fact: String(c.fact).trim().slice(0, 300),
        category: String(c.category ?? 'PROJECT').slice(0, 32),
        tags: typeof c.tags === 'string' ? c.tags : undefined,
      }))
      .filter(c => c.fact.length > 0)
    return { prose, claims }
  } catch {
    diag('splitProseClaims: CLAIMS JSON parse failed (isolated, prose kept)')
    return { prose, claims: [] }
  }
}

/** Frame the recent turn's events into a compact summarizer input with rolling merge. */
function frameInput(session: Session, maxEvents: number): string {
  const events = session.events

  // 1. Recover the most recent previous brief prose for rolling merge.
  let previousProse = ''
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'brief/prose-updated') {
      const data = e.data as { text?: string }
      if (typeof data.text === 'string' && data.text.length > 0) {
        previousProse = data.text.slice(0, 4000)
        break
      }
    }
  }

  // 2. Extract recent sliding window of events and detect specification/documentation files.
  const start = Math.max(0, events.length - maxEvents)
  const lines: string[] = []
  const docFiles = new Set<string>()

  for (let i = start; i < events.length; i++) {
    const event = events[i]
    if (event.type === 'user/message') {
      const text = messageText((event.data as { content: unknown }).content)
      if (text.length > 0) lines.push(`USER: ${text.slice(0, 2500)}`)
    } else if (event.type === 'assistant/message') {
      const data = event.data as { text?: string }
      if (typeof data.text === 'string' && data.text.length > 0) {
        lines.push(`ASSISTANT: ${data.text.slice(0, 2500)}`)
      }
    } else if (event.type === 'tool/call') {
      const data = event.data as { name: string; arguments?: string }
      const argsStr = typeof data.arguments === 'string' && data.arguments.length > 0
        ? ` ${data.arguments.slice(0, 600)}`
        : ''
      lines.push(`TOOL CALL: ${data.name}${argsStr}`)

      // Detect documentation and specification files
      if (data.arguments) {
        const matches = data.arguments.match(/["']([^"']*\.(?:md|json|yaml|yml))["']/g)
        if (matches) {
          for (const m of matches) {
            const clean = m.replace(/["']/g, '')
            if (clean.length > 2) docFiles.add(clean)
          }
        }
      }
    } else if (event.type === 'tool/result') {
      const resultText = toolResultText(event.data)
      if (resultText.length > 0) {
        lines.push(`TOOL RESULT: ${resultText.slice(0, 4000)}`)
      }
    }
  }

  const sections: string[] = []
  if (previousProse.length > 0) {
    sections.push(`--- PREVIOUS SESSION BRIEF ---\n${previousProse}`)
  }
  if (docFiles.size > 0) {
    sections.push(`--- RECENT SPECIFICATION & DOCUMENTATION FILES ---\n${Array.from(docFiles).map(f => `• ${f}`).join('\n')}`)
  }
  if (lines.length > 0) {
    sections.push(`--- RECENT SESSION EVENTS & TOOL RESULTS ---\n${lines.join('\n')}`)
  }
  return sections.join('\n\n')
}

/** Best-effort text extraction from a tool/result event data payload. */
function toolResultText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as { message?: { content?: unknown[] }; error?: { message?: string } }
  if (d.error?.message) return `Error: ${d.error.message}`
  if (!d.message || !Array.isArray(d.message.content)) return ''
  const parts: string[] = []
  for (const block of d.message.content) {
    if (typeof block === 'string') parts.push(block)
    else if (block && typeof block === 'object') {
      const b = block as { text?: string; content?: unknown[]; isError?: boolean }
      if (typeof b.text === 'string') parts.push(b.text)
      if (Array.isArray(b.content)) {
        for (const sub of b.content) {
          if (typeof sub === 'string') parts.push(sub)
          else if (sub && typeof sub === 'object' && typeof (sub as { text?: string }).text === 'string') {
            parts.push((sub as { text: string }).text)
          }
        }
      }
    }
  }
  return parts.filter(Boolean).join(' ').trim()
}

/** Best-effort text extraction from a user message content block. */
function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part !== null && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .filter((text) => text.length > 0)
      .join(' ')
  }
  return ''
}

interface KeeperValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Validates that keeper output completed cleanly rather than cutting off mid-stream.
 * Checks authoritative provider finish signals and structural JSON balance without arbitrary length cutoffs.
 */
function validateKeeperOutput(text: string, finishKind?: string): KeeperValidationResult {
  // 1. Authoritative provider signal
  if (finishKind === 'max-tokens') {
    return { valid: false, reason: 'Stream truncated by maxOutputTokens limit' }
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Empty output received from model' }
  }

  // 2. Case-insensitive CLAIMS structure verification
  const claimsMatch = trimmed.match(/CLAIMS:\s*([\s\S]*)$/i)
  if (claimsMatch) {
    const rawClaims = claimsMatch[1].trim()
    // Explicit empty indicators are valid
    if (/^(none|n\/a|\[\s*\])$/i.test(rawClaims)) {
      return { valid: true }
    }
    // Non-greedy JSON block match
    const jsonMatch = rawClaims.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) {
      return { valid: false, reason: 'CLAIMS tag present but JSON array was truncated/unclosed' }
    }
    try {
      JSON.parse(jsonMatch[0])
    } catch (e) {
      return { valid: false, reason: `Malformed CLAIMS JSON: ${String(e)}` }
    }
  }

  return { valid: true }
}

/** One LLM completion with resolved primary route + fixed fallback (soft-degrading + cutoff shield). */
async function summarize(
  ctx: Context,
  config: Config,
  session: Session,
  input: string,
  signal: AbortSignal,
  route: ResolvedRoute,
): Promise<{ text: string; route: string }> {
  const messages = [createUserMessage({
    content: [{ type: 'text', text: input }],
    source: { kind: 'plugin', plugin: 'enpoi-context-keeper' },
  })]
  const base: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
    system: SYSTEM_PROMPT,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    purpose: 'context-keeper',
    signal,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort as GenerateOptions['reasoningEffort'] } : {}),
  }

  async function executeRoute(provider: string, model: string): Promise<string> {
    const result = await streamTextWithMeta(ctx, { ...base, provider, model })
    const validation = validateKeeperOutput(result.text, result.finishKind)
    if (!validation.valid) {
      throw new Error(`Output invalid/truncated on ${provider}/${model}: ${validation.reason}`)
    }
    return result.text
  }

  try {
    const text = await executeRoute(route.provider, route.model)
    return { text, route: `${route.provider}/${route.model}` }
  } catch (error) {
    if (signal.aborted) throw error
    ctx.logger.warn(`enpoi-context-keeper: primary route failed/cut off (${String(error)}), trying fallback`)
    diag(`primary route failed/cut off (${String(error)}), switching to fallback ${route.fallbackProvider}/${route.fallbackModel}`)

    try {
      const fallbackText = await executeRoute(route.fallbackProvider, route.fallbackModel)
      return {
        text: fallbackText,
        route: `${route.fallbackProvider}/${route.fallbackModel}`,
      }
    } catch (fallbackError) {
      if (signal.aborted) throw fallbackError
      throw new Error(`enpoi-context-keeper: all summary routes failed. Primary: ${String(error)}, Fallback: ${String(fallbackError)}`)
    }
  }
}

/** Stream one completion into plain text and terminal metadata via BlockAssembler. */
async function streamTextWithMeta(ctx: Context, options: GenerateOptions): Promise<{ text: string; finishKind: string }> {
  using callDeadline = deadline(options.signal, 40_000, 'ENPOI_KEEPER_STREAM_TIMEOUT')
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ ...options, signal: callDeadline.signal })) {
    callDeadline.signal.throwIfAborted()
    assembler.push(chunk)
  }
  callDeadline.signal.throwIfAborted()
  const terminalError = finishError(assembler.finish)
  if (terminalError !== undefined) throw terminalError
  const blocks = assembler.blocks()
  const text = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim()
  return { text, finishKind: assembler.finish.kind }
}

/** Translate terminal finish reasons into an auxiliary-call failure (ported from session-title-llm). */
function finishError(finish: { kind: string; failure?: { message: string; code: string } }): Error | undefined {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const failure = finish.failure ?? { message: 'unknown failure', code: 'UNKNOWN' }
      const error = new Error(failure.message) as Error & { code?: string }
      error.code = failure.code
      return error
    }
    case 'max-tokens':
      return new Error('enpoi-context-keeper: summary output reached maxOutputTokens')
    case 'tool-calls':
      return new Error('enpoi-context-keeper: summarizer unexpectedly requested a tool')
    default:
      return undefined
  }
}