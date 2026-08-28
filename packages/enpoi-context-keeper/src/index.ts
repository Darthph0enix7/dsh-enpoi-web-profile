/**
 * Enpoi Harness Context Keeper — demand-driven cognition (Oracle-approved
 * redesign, docs 31/35 amendments).
 *
 * The prose Living Brief is NO LONGER pushed on every turn end. It is
 * materialized ON DEMAND via `ensureFreshBrief()`, consumed exclusively by
 * the Oracle (call #1) and Council (roundtable/chorus start) — both blocking
 * tools that await it. Workers receive the deterministic fold + task card +
 * whatever prose cache exists at spawn (read-only; they never trigger
 * generation and never receive deltas).
 *
 * Cache policy (Oracle amendments 2-4):
 * - Freshness is STRUCTURAL-SEQ distance (basedOnSeq vs current seq, counting
 *   only user/message, turn/end, tool/call, tool/result), not wall-clock.
 * - `structuralDistanceK` (default 24) structural events → re-distill.
 * - `minRefreshMs` (default 60s) is an anti-thrash floor, not a TTL.
 * - Single-flight keyed per (session, basedOnSeq window): a caller joins the
 *   in-flight pass only when its window is still fresh.
 * - Failures are negative-cached for `negativeCacheMs` (default 120s) so a
 *   provider outage cannot fire repeated fallback chains.
 *
 * Memory claims (CBDC Stream B) are DECOUPLED from prose: a batched listener
 * runs one extraction pass per `claimsBatchSize` (default 8) non-aborted
 * turn/ends or `claimsBatchMinutes` (default 5), whichever first. Per-claim
 * trust labels: tool-sourced → `verified_execution`, chat-sourced →
 * `operator` (Oracle amendment 5 — fixes the pre-existing trust bug where
 * chat hearsay auto-graduated as verified).
 *
 * Deleted machinery (P3): the turn/end prose arming, debounce, rerun latch,
 * and wedge-race state machine. The keeper is now a service, not a watcher.
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
  leaseMs?: number
  maxInputEvents?: number
  maxOutputTokens?: number
  /** Structural-event distance that triggers a re-distillation. */
  structuralDistanceK?: number
  /** Anti-thrash floor: reuse a distillation younger than this. */
  minRefreshMs?: number
  /** Failure negative-cache window. */
  negativeCacheMs?: number
  /** Claims batch: one pass per N non-aborted turn/ends… */
  claimsBatchSize?: number
  /** …or T minutes, whichever first. */
  claimsBatchMinutes?: number
}

export const Config = Schema.object({
  provider: Schema.string().default('freellmapi'),
  model: Schema.string().default('auto'),
  fallbackProvider: Schema.string().default('antigravity'),
  fallbackModel: Schema.string().default('gemini-3.7-flash-tiered'),
  leaseMs: Schema.number().default(45_000),
  maxInputEvents: Schema.number().default(80),
  maxOutputTokens: Schema.number().default(2048),
  structuralDistanceK: Schema.number().default(24),
  minRefreshMs: Schema.number().default(60_000),
  negativeCacheMs: Schema.number().default(120_000),
  claimsBatchSize: Schema.number().default(8),
  claimsBatchMinutes: Schema.number().default(5),
})

/** Secrets-exclusion instruction (doc 35 §1.1) — summarization never credentials. */
const PROSE_PROMPT = [
  'You are the Enpoi Harness context keeper — the master background summarizer and architectural keeper for this coding session.',
  'You maintain a running, concise, and highly accurate Living Brief of the session for later dispatch to the Oracle and Council debaters.',
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
  'Output ONLY the relevant section headers from below (omit any section with no substantive content):',
  '',
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
  'No other text at all — no preamble, no CLAIMS block, no JSON.',
].join('\n')

/** Claims-only extraction prompt — decoupled from prose (Oracle amendment 5). */
const CLAIMS_PROMPT = [
  'You are the Enpoi Harness memory extractor. From the [RECENT SESSION EVENTS & TOOL RESULTS] below, extract durable, permanent facts about Adam\'s environment, infrastructure, and architecture.',
  'NEVER extract, repeat, or retain credentials, passwords, API keys, tokens, or personal secrets.',
  '',
  'Output EXACTLY one line: "CLAIMS:" followed by a JSON array: [{"fact":"...","category":"ARCHITECTURE","tags":"...","source":"tool"}]',
  '- category limited to ARCHITECTURE, CONFIG_VALUES, or PROJECT.',
  '- source MUST be "tool" when the fact is derived from tool results/executions (verified by execution), or "chat" when it was stated by the user or assistant in conversation.',
  '- File 2-4 durable facts whenever the session surfaces them; else "CLAIMS: []".',
  '- Skip transient chatter and anything already obvious from the session itself.',
  'No other text at all.',
].join('\n')

/** Structural event types — the only events that age the brief (Oracle amendment 3). */
const STRUCTURAL_TYPES = new Set(['user/message', 'turn/end', 'tool/call', 'tool/result'])

/** Count structural events with seq > fromSeq (backwards scan, O(distance)). */
function countStructuralAfter(session: Session, fromSeq: number): number {
  let count = 0
  const events = session.events
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.seq <= fromSeq) break
    if (STRUCTURAL_TYPES.has(event.type)) count += 1
  }
  return count
}

/** Count structural events with seq <= toSeq (forward scan). */
function countStructuralUpTo(session: Session, toSeq: number): number {
  let count = 0
  for (const event of session.events) {
    if (event.seq > toSeq) break
    if (STRUCTURAL_TYPES.has(event.type)) count += 1
  }
  return count
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
 * Resolve the keeper's runtime parameters (doc 38): the
 * `enpoi-orchestration.parameters.keeper` settings namespace overrides the
 * plugin Config per wake — hot-swap, no restart. Values are clamped to the
 * doc-38 ranges.
 */
export function resolveKeeperParams(ctx: Context, config: Config): Config {
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => { parameters?: { keeper?: Partial<Config> } } } | undefined
    const p = settings?.get?.('enpoi-orchestration')?.parameters?.keeper
    if (p === undefined || typeof p !== 'object') return config
    const clamp = (v: unknown, fallback: number, min: number, max: number): number =>
      typeof v === 'number' && !Number.isNaN(v) ? Math.min(max, Math.max(min, v)) : fallback
    return {
      ...config,
      leaseMs: clamp(p.leaseMs, config.leaseMs ?? 45_000, 15_000, 120_000),
      maxInputEvents: clamp(p.maxInputEvents, config.maxInputEvents ?? 80, 20, 200),
      maxOutputTokens: clamp(p.maxOutputTokens, config.maxOutputTokens ?? 2048, 512, 4096),
      structuralDistanceK: clamp(p.structuralDistanceK, config.structuralDistanceK ?? 24, 4, 200),
      minRefreshMs: clamp(p.minRefreshMs, config.minRefreshMs ?? 60_000, 5_000, 300_000),
      negativeCacheMs: clamp(p.negativeCacheMs, config.negativeCacheMs ?? 120_000, 5_000, 600_000),
      claimsBatchSize: clamp(p.claimsBatchSize, config.claimsBatchSize ?? 8, 1, 50),
      claimsBatchMinutes: clamp(p.claimsBatchMinutes, config.claimsBatchMinutes ?? 5, 1, 60),
    }
  } catch {
    return config
  }
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

/** Result of an ensureFreshBrief call. */
export interface BriefResult {
  ok: boolean
  prose: string | null
  model?: string
  reason: 'cache-hit' | 'distilled' | 'failed' | 'negative-cached'
}

/** Per-session brief cache entry. */
interface BriefCacheEntry {
  basedOnSeq: number
  basedOnStructuralCount: number
  prose: string
  model: string
  updatedAt: number
  /** Failure negative-cache deadline (ms epoch); 0 = none. */
  negativeUntil: number
  /** In-flight distillation promise (single-flight). */
  inFlight: Promise<BriefResult> | null
  /** The snapshot seq the in-flight pass is based on. */
  inFlightSnapshotSeq: number
}

function emptyEntry(): BriefCacheEntry {
  return {
    basedOnSeq: 0,
    basedOnStructuralCount: 0,
    prose: '',
    model: '',
    updatedAt: 0,
    negativeUntil: 0,
    inFlight: null,
    inFlightSnapshotSeq: 0,
  }
}

/**
 * The demand-driven brief service. Owns the per-session prose cache and the
 * single-flight distillation. Exposed to consumers (oracle, council) via the
 * module-level singleton set in apply() — the profile packages are bundled
 * separately, so a Cordis service registry cannot be shared reliably.
 */
export class BriefService {
  private readonly cache = new Map<string, BriefCacheEntry>()

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {}

  /**
   * Materialize (or reuse) the session's prose brief.
   *
   * Cache policy: negative-cache → anti-thrash floor → structural distance →
   * single-flight join → distill. Never throws for provider failures — it
   * returns `{ ok: false }` (soft-degrading, frozen doc principle). Throws
   * only when the CALLER's signal aborts (the consumer is being cancelled).
   */
  async ensureFreshBrief(session: Session, signal?: AbortSignal): Promise<BriefResult> {
    const key = session.id
    // Doc 38: runtime parameters resolved fresh per call (hot-swap).
    const cfg = resolveKeeperParams(this.ctx, this.config)
    const entry = this.cache.get(key)
    const now = Date.now()

    // 1. Negative cache: a recent failure is reused (no fallback-chain storms).
    if (entry !== undefined && entry.negativeUntil > now) {
      return { ok: false, prose: null, reason: 'negative-cached' }
    }

    // 2. Anti-thrash floor: a distillation younger than minRefreshMs is reused.
    if (entry !== undefined && entry.prose.length > 0 && now - entry.updatedAt < (cfg.minRefreshMs ?? 60_000)) {
      return { ok: true, prose: entry.prose, model: entry.model, reason: 'cache-hit' }
    }

    // 3. Structural freshness: silence never invalidates prose.
    if (entry !== undefined && entry.prose.length > 0) {
      const distance = countStructuralAfter(session, entry.basedOnSeq)
      if (distance <= (cfg.structuralDistanceK ?? 24)) {
        return { ok: true, prose: entry.prose, model: entry.model, reason: 'cache-hit' }
      }
    }

    // 4. Single-flight: join an in-flight pass whose window is still fresh.
    if (entry !== undefined && entry.inFlight !== null) {
      const inFlightDistance = countStructuralAfter(session, entry.inFlightSnapshotSeq)
      if (inFlightDistance <= (cfg.structuralDistanceK ?? 24)) {
        try {
          return await entry.inFlight
        } catch (error) {
          // Oracle defect 2: a joiner must NOT inherit the ORIGINATOR's abort
          // rejection — only this caller's own cancellation propagates.
          if (signal?.aborted) throw error
          return { ok: false, prose: null, reason: 'failed' }
        }
      }
      // The in-flight pass is for an older window — start a new one.
    }

    // 5. Distill (snapshot the seq BEFORE the async call — I3 causal ordering).
    const snapshotSeq = session.events.at(-1)?.seq ?? session.seq
    const promise = this.distill(session, signal, snapshotSeq, cfg)
    this.cache.set(key, {
      ...(entry ?? emptyEntry()),
      inFlight: promise,
      inFlightSnapshotSeq: snapshotSeq,
    })
    try {
      return await promise
    } finally {
      const current = this.cache.get(key)
      if (current !== undefined && current.inFlight === promise) {
        this.cache.set(key, { ...current, inFlight: null })
      }
    }
  }

  /** One distillation pass: lease-bound LLM call, then append + cache. */
  private async distill(session: Session, signal: AbortSignal | undefined, snapshotSeq: number, cfg: Config): Promise<BriefResult> {
    const lease = new AbortController()
    const leaseTimer = setTimeout(() => lease.abort(), cfg.leaseMs ?? 45_000)
    const combined = signal !== undefined ? AbortSignal.any([signal, lease.signal]) : lease.signal
    try {
      const input = frameInput(session, cfg.maxInputEvents ?? 80)
      if (input.length === 0) {
        diag(`ensureFreshBrief: session=${session.id} — empty input, skipping`)
        return { ok: false, prose: null, reason: 'failed' }
      }
      const route = resolveKeeperRoute(this.ctx, cfg)
      const snapshotStructural = countStructuralUpTo(session, snapshotSeq)
      diag(`ensureFreshBrief: session=${session.id} — calling LLM (input ${input.length} chars, route ${route.provider}/${route.model}, basedOnSeq ${snapshotSeq})`)
      const result = await summarize(this.ctx, cfg, session, input, combined, route, PROSE_PROMPT, false)
      const prose = cleanKeeperProse(result.text)
      if (prose.length === 0) {
        diag(`ensureFreshBrief: session=${session.id} — empty or cleaned-empty prose, skipping`)
        return { ok: false, prose: null, reason: 'failed' }
      }
      // Clean stack: the LLM resolved, no append is being published.
      session.append('brief/prose-updated', {
        basedOnSeq: snapshotSeq,
        basedOnStructuralCount: snapshotStructural,
        structuralDistanceK: cfg.structuralDistanceK ?? 24,
        model: result.route,
        text: prose,
        origin: 'context-keeper',
      })
      // Preserve the CURRENT entry's in-flight registration — a superseding
      // pass for a newer window may be registered while this one completes
      // (Oracle defect 1: unconditional inFlight:null erased it).
      const current = this.cache.get(session.id)
      this.cache.set(session.id, {
        ...(current ?? emptyEntry()),
        basedOnSeq: snapshotSeq,
        basedOnStructuralCount: snapshotStructural,
        prose,
        model: result.route,
        updatedAt: Date.now(),
        negativeUntil: 0,
      })
      diag(`ensureFreshBrief: session=${session.id} — appended brief/prose-updated via ${result.route} (${prose.length} chars, basedOnSeq ${snapshotSeq})`)
      return { ok: true, prose, model: result.route, reason: 'distilled' }
    } catch (error) {
      if (signal?.aborted) throw error // caller cancelled — propagate
      const entry = this.cache.get(session.id)
      this.cache.set(session.id, {
        ...(entry ?? emptyEntry()),
        negativeUntil: Date.now() + (cfg.negativeCacheMs ?? 120_000),
      })
      diag(`ensureFreshBrief: session=${session.id} — FAILED ${String(error)} (negative-cached ${cfg.negativeCacheMs ?? 120_000}ms)`)
      return { ok: false, prose: null, reason: 'failed' }
    } finally {
      clearTimeout(leaseTimer)
    }
  }
}

/** Module-level singleton — set by apply(), read by consumers (oracle/council). */
let briefService: BriefService | null = null

/** Get the mounted brief service (null before apply or if the plugin is absent). */
export function getBriefService(): BriefService | null {
  return briefService
}

/** Create a standalone service (tests / headless use). */
export function createBriefService(ctx: Context, config: Config): BriefService {
  return new BriefService(ctx, config)
}

export function apply(ctx: Context, config: Config): void {
  const ownedService = createBriefService(ctx, config)
  briefService = ownedService
  diag(`apply: mounted (demand-driven; prose on oracle/council use, claims batched ${config.claimsBatchSize ?? 8}/${config.claimsBatchMinutes ?? 5}min)`)

  // ── Claims batched listener (P1, survives P3) ─────────────────────────────
  // A plain counter + timer — NO debounce, NO rerun latch, NO wedge machinery.
  const claimCounters = new Map<string, { count: number; timer: NodeJS.Timeout | null }>()
  const claimsRunning = new Set<string>()

  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    if (event.type !== 'turn/end') return
    const reason = (event.data as { reason: { kind: string } }).reason
    if (reason.kind === 'aborted') return // don't extract from interrupted turns
    let counter = claimCounters.get(session.id)
    if (counter === undefined) {
      counter = { count: 0, timer: null }
      claimCounters.set(session.id, counter)
    }
    counter.count += 1
    // 5-min timer, reset on each turn/end ("or T minutes, whichever first").
    if (counter.timer !== null) clearTimeout(counter.timer)
    counter.timer = setTimeout(() => {
      counter!.timer = null
      void runClaimsPass(ctx, config, session, claimsRunning)
    }, (config.claimsBatchMinutes ?? 5) * 60_000)
    // Batch size reached — run now.
    if (counter.count >= (config.claimsBatchSize ?? 8)) {
      counter.count = 0
      if (counter.timer !== null) {
        clearTimeout(counter.timer)
        counter.timer = null
      }
      void runClaimsPass(ctx, config, session, claimsRunning)
    }
  })

  ctx.on('dispose', () => {
    for (const counter of claimCounters.values()) {
      if (counter.timer !== null) clearTimeout(counter.timer)
    }
    claimCounters.clear()
    claimsRunning.clear()
    // Oracle Q4 nit: only null the singleton if WE own it — a second mounted
    // instance (tests + runtime) must not kill the first's service.
    if (briefService === ownedService) briefService = null
  })
}

/** One batched claims pass: single-flight, lease-bound, trust-split intake. */
async function runClaimsPass(
  ctx: Context,
  config: Config,
  session: Session,
  running: Set<string>,
): Promise<void> {
  if (running.has(session.id)) return // single-flight — the next batch catches it
  running.add(session.id)
  // Doc 38: runtime parameters resolved fresh per pass (hot-swap).
  const cfg = resolveKeeperParams(ctx, config)
  const lease = new AbortController()
  const leaseTimer = setTimeout(() => lease.abort(), cfg.leaseMs ?? 45_000)
  try {
    const input = frameInput(session, cfg.maxInputEvents ?? 80)
    if (input.length === 0) return
    const route = resolveKeeperRoute(ctx, cfg)
    diag(`claims: session=${session.id} — calling LLM (input ${input.length} chars, route ${route.provider}/${route.model})`)
    const result = await summarize(ctx, cfg, session, input, lease.signal, route, CLAIMS_PROMPT, true)
    const claims = splitClaims(result.text)
    if (claims.length === 0) {
      diag(`claims: session=${session.id} — no claims extracted`)
      return
    }
    // Open INSIDE the try (Oracle D1): makePipeline construction must also be
    // covered by the close — a construction throw must not leak the handle.
    const memDb = openMemoryDb()
    try {
      const mem = makePipeline(memDb)
      const provenance = JSON.stringify({ sessionId: session.id })
      const toolClaims = claims.filter(c => c.source === 'tool')
      const chatClaims = claims.filter(c => c.source !== 'tool')
      if (toolClaims.length > 0) {
        await mem.intake(
          toolClaims.map(c => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: 'keeper', trust: 'verified_execution', provenance },
        )
      }
      if (chatClaims.length > 0) {
        await mem.intake(
          chatClaims.map(c => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: 'keeper', trust: 'operator', provenance },
        )
      }
      diag(`claims: session=${session.id} — ${toolClaims.length} tool + ${chatClaims.length} chat claim(s) filed`)
    } finally {
      // Oracle defect 4: node:sqlite does not auto-close on GC — close the
      // per-pass handle or the fd leaks.
      memDb.close()
    }
  } catch (error) {
    diag(`claims: session=${session.id} — FAILED ${String(error)}`)
  } finally {
    clearTimeout(leaseTimer)
    running.delete(session.id)
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

/** Parse the CLAIMS block with per-claim source tags (A3.5: parse is isolated). */
export function splitClaims(text: string): Array<{ fact: string; category: string; tags?: string; source: 'tool' | 'chat' }> {
  const idx = text.indexOf('CLAIMS:')
  if (idx === -1) return []
  const jsonPart = text.slice(idx + 'CLAIMS:'.length).trim()
  try {
    // Non-greedy match (Oracle defect 5): the greedy [\s\S]* ran to the LAST
    // ']' in the output, so trailing bracketed prose broke JSON.parse and
    // silently dropped the whole pass's claims.
    const m = jsonPart.match(/\[[\s\S]*?\]/)
    if (m === null) return []
    const arr: unknown = JSON.parse(m[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && typeof (c as Record<string, unknown>).fact === 'string')
      .map(c => ({
        fact: String(c.fact).trim().slice(0, 300),
        category: String(c.category ?? 'PROJECT').slice(0, 32),
        tags: typeof c.tags === 'string' ? c.tags : undefined,
        source: c.source === 'tool' ? 'tool' : 'chat',
      }))
      .filter(c => c.fact.length > 0)
  } catch {
    diag('splitClaims: CLAIMS JSON parse failed (isolated)')
    return []
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
function validateKeeperOutput(text: string, finishKind?: string, expectClaims = false): KeeperValidationResult {
  // 1. Authoritative provider signal
  if (finishKind === 'max-tokens') {
    return { valid: false, reason: 'Stream truncated by maxOutputTokens limit' }
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Empty output received from model' }
  }

  // 2. Case-insensitive CLAIMS structure verification (claims passes only)
  if (expectClaims) {
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
  systemPrompt: string,
  expectClaims: boolean,
): Promise<{ text: string; route: string }> {
  const messages = [createUserMessage({
    content: [{ type: 'text', text: input }],
    source: { kind: 'plugin', plugin: 'enpoi-context-keeper' },
  })]
  const base: GenerateOptions = {
    provider: route.provider,
    model: route.model,
    messages,
    system: systemPrompt,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    purpose: 'context-keeper',
    signal,
    ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort as GenerateOptions['reasoningEffort'] } : {}),
  }

  async function executeRoute(provider: string, model: string): Promise<string> {
    const result = await streamTextWithMeta(ctx, { ...base, provider, model })
    const validation = validateKeeperOutput(result.text, result.finishKind, expectClaims)
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