/**
 * enpoi-model-chains — settings-defined model failover chains.
 *
 * A chain (UI name: "model group") is an ordered list of `{ provider, model,
 * effort? }` links that mixes providers/models, so a consumer that fails on
 * one link can continue on the next instead of dying. Data lives in the
 * shared `enpoi-orchestration` settings namespace under `chains` (the same
 * host-side settings API every other profile plugin reads; the namespace
 * schema is registered by enpoi-capabilities):
 *
 *   chains:
 *     stable:
 *       label: Stable
 *       links: [ { provider, model, effort? }, … ]   # ordered
 *       attempts: 2        # per link; consumed by the fork's adapter loop
 *       onCut: failover    # failover | continue
 *       disabled: false    # retire switch
 *
 * This plugin provides the `modelChains` service the fork lanes and the
 * one-shot consumers resolve through:
 *
 *   ctx.get('modelChains').resolve('stable')
 *     → { id, label?, links: [{ provider, model, effort? }], attempts?, onCut? }
 *
 * `resolve()` answers a FROZEN, detached snapshot: the array and every link
 * are frozen, and the cache is rebuilt only on `settings/document-updated`
 * (and `settings/updated`) for `enpoi-orchestration`. A caller that snapshots
 * at turn/step start therefore keeps one consistent chain across its
 * attempts while an operator edit applies on the next resolution.
 *
 * Failure posture is FAIL-OPEN: an unknown id, `disabled: true`, a malformed
 * document, and an absent service all answer `undefined`, so the caller keeps
 * its inherited/default model. Malformed links (empty provider/model) are
 * dropped, never fatal, with one stderr warning per chain id — this harness's
 * logger drops info/warn, so stderr is the observable channel.
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'enpoi-model-chains'

/** The settings service must be up before the namespace can be read. */
export const inject = ['settings']

/** Namespace that owns `chains` (registered by enpoi-capabilities). */
const ORCH_NS = 'enpoi-orchestration'

/** One chain link: a provider route carrying exactly one model. */
export interface ModelChainLink {
  /** Provider route id (e.g. `antigravity`). */
  provider: string
  /** Model id interpreted by that provider (e.g. `gemini-3.8-flash-tiered`). */
  model: string
  /** Adapter-owned reasoning effort for this link, when declared. */
  effort?: string
}

/** One resolved chain snapshot; frozen by {@link ModelChainsResolver.resolve}. */
export interface ModelChain {
  /** Chain id as declared under `chains`. */
  id: string
  /** Operator-facing label, when declared. */
  label?: string
  /** Ordered links; never empty, never containing a malformed entry. */
  links: ReadonlyArray<Readonly<ModelChainLink>>
  /** Per-link attempt budget declared by the operator (absent = caller default). */
  attempts?: number
  /** Cut policy (absent = caller's `failover` default). */
  onCut?: 'failover' | 'continue'
}

/** The service contract consumers call through `ctx.get('modelChains')`. */
export interface ModelChainsService {
  /**
   * Resolve one chain id to a frozen snapshot.
   * @param id - chain id from `enpoi-orchestration.chains`.
   * @returns the frozen chain, or `undefined` for unknown/disabled/malformed ids.
   */
  resolve(id: string): ModelChain | undefined
}

/** Whether one value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A trimmed non-empty string, or undefined. */
function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Parse one raw `chains[id]` entry into a frozen snapshot. Malformed links are
 * dropped (with a warning); disabled, shapeless, and link-less entries answer
 * `undefined` so callers fail open.
 * @param id - the chain id being parsed (used in warnings and the snapshot).
 * @param raw - the raw `chains[id]` settings value.
 * @param warn - stderr reporter; the resolver dedupes it per id.
 * @returns the frozen chain, or undefined when unusable.
 */
export function parseChainEntry(
  id: string,
  raw: unknown,
  warn: (line: string) => void,
): ModelChain | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw)) {
    warn(`[enpoi-model-chains] chain "${id}" is not an object — ignored\n`)
    return undefined
  }
  if (raw.disabled === true) return undefined
  const rawLinks = raw.links
  if (!Array.isArray(rawLinks)) {
    warn(`[enpoi-model-chains] chain "${id}" has no links array — ignored\n`)
    return undefined
  }
  const links: ModelChainLink[] = []
  let dropped = 0
  for (const candidate of rawLinks) {
    if (!isRecord(candidate)) {
      dropped += 1
      continue
    }
    const provider = nonEmptyString(candidate.provider)
    const model = nonEmptyString(candidate.model)
    if (provider === undefined || model === undefined) {
      dropped += 1
      continue
    }
    const effort = nonEmptyString(candidate.effort)
    links.push(Object.freeze({ provider, model, ...(effort !== undefined ? { effort } : {}) }))
  }
  if (dropped > 0) {
    warn(`[enpoi-model-chains] chain "${id}": dropped ${dropped} malformed link(s) — provider and model are required\n`)
  }
  if (links.length === 0) {
    warn(`[enpoi-model-chains] chain "${id}" has no usable links — ignored\n`)
    return undefined
  }
  const label = nonEmptyString(raw.label)
  const attemptsValue = raw.attempts
  const attempts = typeof attemptsValue === 'number' && Number.isFinite(attemptsValue) && attemptsValue >= 1
    ? Math.floor(attemptsValue)
    : undefined
  const onCut = raw.onCut === 'continue' ? 'continue' as const : raw.onCut === 'failover' ? 'failover' as const : undefined
  return Object.freeze({
    id,
    ...(label !== undefined ? { label } : {}),
    links: Object.freeze(links),
    ...(attempts !== undefined ? { attempts } : {}),
    ...(onCut !== undefined ? { onCut } : {}),
  })
}

/**
 * Read the raw `enpoi-orchestration.chains` map through the same host-side
 * settings API the other profile plugins use. A missing/malformed map resolves
 * as empty so one bad document cannot brick every consumer.
 * @param ctx - owning plugin context.
 * @returns the raw chain map (possibly empty).
 */
export function readRawChains(ctx: Context): Record<string, unknown> {
  try {
    const settings = ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
    const doc = settings?.get?.(ORCH_NS)
    if (!isRecord(doc)) return {}
    const chains = doc.chains
    if (chains === undefined) return {}
    if (!isRecord(chains)) {
      process.stderr.write(`[enpoi-model-chains] "${ORCH_NS}.chains" is not a map — ignored\n`)
      return {}
    }
    return chains
  } catch (error) {
    process.stderr.write(`[enpoi-model-chains] cannot read "${ORCH_NS}.chains": ${String(error)}\n`)
    return {}
  }
}

/**
 * Caching chain resolver. The raw document is read once at construction and
 * rebuilt by {@link refresh} — callers through {@link ModelChainsService.resolve}
 * never see live edits mid-turn, and a malformed chain is reported once per id
 * (until it parses clean, so a re-broken chain warns again).
 */
export class ModelChainsResolver implements ModelChainsService {
  private raw: Record<string, unknown>
  private readonly cache = new Map<string, ModelChain | undefined>()
  private readonly warned = new Set<string>()

  /**
   * @param readRaw - reader for the raw `chains` map (ctx-bound in production).
   */
  constructor(private readonly readRaw: () => Record<string, unknown>) {
    this.raw = this.readRaw()
  }

  /** Re-read the settings document; the next resolve builds fresh snapshots. */
  refresh(): void {
    this.raw = this.readRaw()
    this.cache.clear()
  }

  /**
   * Resolve one chain id against the current snapshot.
   * @param id - chain id.
   * @returns the frozen chain, or undefined (unknown/disabled/malformed).
   */
  resolve(id: string): ModelChain | undefined {
    const key = typeof id === 'string' ? id.trim() : ''
    if (key === '') return undefined
    if (this.cache.has(key)) return this.cache.get(key)
    let reported = false
    const chain = parseChainEntry(key, this.raw[key], (line) => {
      if (reported || this.warned.has(key)) return
      reported = true
      this.warned.add(key)
      process.stderr.write(line)
    })
    if (chain !== undefined) this.warned.delete(key)
    this.cache.set(key, chain)
    return chain
  }
}

/**
 * Mount the `modelChains` service and keep it in step with the namespace.
 * @param ctx - profile plugin Context.
 */
export function apply(ctx: Context): void {
  const resolver = new ModelChainsResolver(() => readRawChains(ctx))
  // Plain-object facade: the contract's `resolve` is this-bound to nothing, so
  // a caller that destructures the method (`const { resolve } = service`)
  // still works.
  ctx.provide('modelChains', { resolve: (id: string) => resolver.resolve(id) })
  const onNamespaceChange = ((ns: unknown) => {
    if (String(ns) !== ORCH_NS) return
    resolver.refresh()
  }) as (...args: unknown[]) => unknown
  ctx.on('settings/document-updated', onNamespaceChange)
  ctx.on('settings/updated', onNamespaceChange)
  process.stderr.write('[enpoi-model-chains] mounted\n')
}
