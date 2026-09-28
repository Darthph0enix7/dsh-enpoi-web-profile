/**
 * enpoi-heavy-providers — route/credential/cache planning for heavy providers.
 *
 * Decorator-free by design (the profile's vitest pipeline cannot transform
 * standard decorators); `remote.ts` is a thin decorated shell over this file.
 * Every side effect goes through an injected seam so tests run without a
 * harness: settings, credentials, fetch, filesystem paths, and the step
 * runner all arrive from the caller.
 *
 * @module dsh-enpoi-heavy-providers/planner
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { HeavyHealth, HeavyProviderManifest, HeavyStep } from './manifests.js'

/** The llm-pi-ai settings namespace every route write targets. */
export const LLM_NS = 'llm-pi-ai'
/** The namespace that owns `chains` (registered by enpoi-capabilities). */
export const ORCHESTRATION_NS = 'enpoi-orchestration'

/** Minimal settings seam (matches the live service). */
export interface SettingsSeam {
  describe?(): Array<{ ns: string; revision: number; value?: unknown }>
  mutate(ns: string, ops: readonly Record<string, unknown>[], expectedRevision?: number): Promise<void>
}

/** Minimal credentials seam (matches the live service). */
export interface CredentialsSeam {
  resolve(ref: string): Promise<{ value?: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** The subset of `fetch` the planner uses. */
export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
}>

/** Everything a planner call needs from the host. */
export interface HeavyDeps {
  /** User home; `{home}`/`{config}` placeholder base. */
  home: string
  /** DSH home directory; pools and the discovered-model cache live under it. */
  dshHome: string
  settings?: SettingsSeam | undefined
  credentials?: CredentialsSeam | undefined
  fetchImpl?: FetchLike | undefined
  /** Runs one shell step (the service wires this to `ctx.subprocess`). */
  runStep: (step: HeavyStep) => Promise<StepOutcome>
}

/** One shell step's result. */
export interface StepOutcome {
  exitCode: number | null
  output: string
}

/** One route profile written to `llm-pi-ai.providers.<id>`. */
export interface HeavyRouteProfile {
  displayName: string
  api: string
  baseURL: string
  apiKeyEnv?: string
  keyless?: boolean
  models: Array<{ id: string; name?: string }>
}

/** Substitute the runner placeholders in one declared string. */
export function substitute(value: string, home: string): string {
  return value.replaceAll('{home}', home).replaceAll('{config}', join(home, '.config'))
}

/** The base URL a mode points the route at. */
export function modeBaseURL(manifest: HeavyProviderManifest, mode: 'reuse' | 'local'): string {
  return mode === 'reuse' ? manifest.reuse.baseURL : manifest.local.baseURL
}

/** The health probe a configured mode should be checked with. */
export function modeHealth(manifest: HeavyProviderManifest, mode: 'reuse' | 'local'): HeavyHealth {
  return mode === 'reuse' ? manifest.reuse.health : manifest.local.health
}

/**
 * Build the route profile for one mode. Auth follows the manifest: `none`
 * writes `keyless`, `placeholder` writes only the reference (llm-pi-ai refuses
 * keyless anthropic routes), and the DSH key pool is NEVER declared — the
 * heavy providers either have their own pool (antigravity) or a single key.
 */
export function routeProfile(
  manifest: HeavyProviderManifest,
  mode: 'reuse' | 'local',
  models: ReadonlyArray<{ id: string; name?: string }>,
): HeavyRouteProfile {
  const list = models.length > 0
    ? models.map(model => model.name === undefined ? { id: model.id } : { id: model.id, name: model.name })
    : manifest.fallbackModel === undefined ? [] : [{ id: manifest.fallbackModel }]
  return {
    displayName: `${manifest.label}${mode === 'reuse' ? ' (server)' : ' (local)'}`,
    api: manifest.protocol,
    baseURL: modeBaseURL(manifest, mode),
    ...manifest.auth.apiKeyEnv === undefined ? {} : { apiKeyEnv: manifest.auth.apiKeyEnv },
    ...manifest.auth.kind === 'none' ? { keyless: true } : {},
    models: list,
  }
}

/**
 * Probe one health endpoint. Never throws: an unreachable dashboard or
 * service answers `{ ok: false }` so adding is never blocked by a probe.
 */
export async function probeHealth(
  probe: HeavyHealth,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  now: () => number = Date.now,
): Promise<{ ok: boolean; status?: number; error?: string; checkedAt: number }> {
  const checkedAt = now()
  try {
    const response = await fetchImpl(probe.url, { signal: AbortSignal.timeout(probe.timeoutMs ?? 5000) })
    const accepted = probe.expectStatus ?? undefined
    const statusOk = accepted === undefined ? response.status >= 200 && response.status < 300 : accepted.includes(response.status)
    if (!statusOk) return { ok: false, status: response.status, error: `HTTP ${String(response.status)}`, checkedAt }
    if (probe.expectBody !== undefined && !(await response.text()).includes(probe.expectBody)) {
      return { ok: false, status: response.status, error: `body missing "${probe.expectBody}"`, checkedAt }
    }
    return { ok: true, status: response.status, checkedAt }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), checkedAt }
  }
}

/** One discovered model, before enrichment. */
export interface DiscoveredModel {
  id: string
  name?: string
}

/**
 * Discover a route's models from `GET {baseURL}/models`. Best-effort: an
 * unreachable or refusing endpoint answers `[]` and the caller falls back to
 * the manifest's fallback model.
 */
export async function discoverModels(
  baseURL: string,
  apiKey: string | undefined,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<DiscoveredModel[]> {
  const url = `${baseURL.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (apiKey !== undefined && apiKey.length > 0) headers.authorization = `Bearer ${apiKey}`
  try {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return []
    const body = JSON.parse(await response.text()) as { data?: unknown } | unknown[]
    const rows = Array.isArray(body) ? body : body.data
    if (!Array.isArray(rows)) return []
    const seen = new Set<string>()
    const models: DiscoveredModel[] = []
    for (const row of rows.slice(0, 2000)) {
      if (row === null || typeof row !== 'object') continue
      const id = (row as { id?: unknown }).id
      if (typeof id !== 'string' || id === '' || seen.has(id)) continue
      seen.add(id)
      const name = (row as { name?: unknown }).name
      models.push(typeof name === 'string' && name !== '' ? { id, name } : { id })
    }
    return models
  } catch {
    return []
  }
}

/** Current settings revision for one namespace, when the seam exposes one. */
function revisionOf(settings: SettingsSeam, ns: string): number | undefined {
  return settings.describe?.().find(entry => entry.ns === ns)?.revision
}

/** Read one namespace's document through the settings seam. */
export function readNamespace(settings: SettingsSeam | undefined, ns: string): Record<string, unknown> | undefined {
  const value = settings?.describe?.().find(entry => entry.ns === ns)?.value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** The route profile already configured for one id, when any. */
export function configuredProfile(deps: HeavyDeps, id: string): Record<string, unknown> | undefined {
  const section = readNamespace(deps.settings, LLM_NS)
  const providers = section?.providers
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return undefined
  const profile = (providers as Record<string, unknown>)[id]
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return undefined
  return profile as Record<string, unknown>
}

/**
 * Write the route profile. Only ever called after a successful probe/install;
 * a failure rejects the caller and leaves no route behind.
 */
export async function writeRoute(
  deps: HeavyDeps,
  manifest: HeavyProviderManifest,
  mode: 'reuse' | 'local',
  models: ReadonlyArray<DiscoveredModel>,
): Promise<HeavyRouteProfile> {
  const settings = deps.settings
  if (settings === undefined) throw new Error('settings seam absent — cannot write the route')
  const profile = routeProfile(manifest, mode, models)
  await settings.mutate(LLM_NS, [{ op: 'set', path: ['providers', manifest.id], value: profile }], revisionOf(settings, LLM_NS))
  return profile
}

/** Store the unified key when the user supplied one; no key means no credential. */
export async function storeCredential(deps: HeavyDeps, manifest: HeavyProviderManifest, key: string | undefined): Promise<boolean> {
  const ref = manifest.auth.apiKeyEnv
  if (key === undefined || key.trim() === '' || ref === undefined) return false
  const credentials = deps.credentials
  if (credentials === undefined) throw new Error('credentials seam absent — cannot store the key')
  await credentials.set(ref, key.trim())
  return true
}

/** The outcome of one add. */
export interface ReuseOutcome {
  route: HeavyRouteProfile
  health: { ok: boolean; status?: number; error?: string; checkedAt: number }
  models: DiscoveredModel[]
  credentialStored: boolean
}

/**
 * The recommended add: probe the server endpoint, discover its models, write
 * the route, then store the key when one was supplied. The probe never blocks
 * the add — its verdict is reported for the UI's health badge.
 */
export async function reuseOnServer(
  deps: HeavyDeps,
  manifest: HeavyProviderManifest,
  key?: string,
): Promise<ReuseOutcome> {
  const health = await probeHealth(modeHealth(manifest, 'reuse'), deps.fetchImpl)
  const models = await discoverModels(modeBaseURL(manifest, 'reuse'), key, deps.fetchImpl)
  const route = await writeRoute(deps, manifest, 'reuse', models)
  const credentialStored = await storeCredential(deps, manifest, key)
  return { route, health, models, credentialStored }
}

/* ── removal ─────────────────────────────────────────────────────────────── */

/** The discovered-model cache path (mirrors the provider-sync contract). */
export function discoveredCachePath(deps: HeavyDeps): string {
  const override = process.env.DSH_DISCOVERED_MODELS
  if (override !== undefined && override.length > 0) return override
  return join(deps.dshHome, 'cache', 'discovered-models.json')
}

/** Delete one route's entry from the discovered-model cache; returns whether it existed. */
export function removeDiscoveredEntry(deps: HeavyDeps, id: string): boolean {
  const path = discoveredCachePath(deps)
  if (!existsSync(path)) return false
  try {
    const document = JSON.parse(readFileSync(path, 'utf8')) as { version?: number; routes?: Record<string, unknown> }
    const routes = document.routes
    if (routes === null || typeof routes !== 'object' || routes === undefined) return false
    if (!(id in routes)) return false
    delete routes[id]
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${String(process.pid)}`
    writeFileSync(temporary, JSON.stringify(document), 'utf8')
    renameSync(temporary, path)
    return true
  } catch {
    return false
  }
}

/**
 * Delete `$DSH_HOME/pools/<id>.json` — the fork's per-route key-pool state.
 * A missing file is not an error.
 */
export function removePoolState(deps: HeavyDeps, id: string): boolean {
  const path = join(deps.dshHome, 'pools', `${id}.json`)
  if (!existsSync(path)) return false
  try {
    rmSync(path)
    return true
  } catch {
    return false
  }
}

/** Whether one chain link references a route. */
function linkReferences(link: unknown, id: string): boolean {
  return link !== null && typeof link === 'object' && (link as { provider?: unknown }).provider === id
}

/**
 * Remove every chain link that names the route. A chain left with no links
 * and no selectors is dropped with it. Returns the number of removed links;
 * a document that does not change is not written.
 */
export async function removeChainReferences(deps: HeavyDeps, id: string): Promise<number> {
  const settings = deps.settings
  const document = readNamespace(settings, ORCHESTRATION_NS)
  const chains = document?.chains
  if (chains === null || typeof chains !== 'object' || Array.isArray(chains)) return 0
  let removed = 0
  const next: Record<string, unknown> = {}
  for (const [chainId, raw] of Object.entries(chains as Record<string, unknown>)) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      next[chainId] = raw
      continue
    }
    const chain = raw as Record<string, unknown>
    const links = Array.isArray(chain.links) ? chain.links : []
    const kept = links.filter((link) => {
      const drop = linkReferences(link, id)
      if (drop) removed += 1
      return !drop
    })
    const selectors = Array.isArray(chain.selectors) ? chain.selectors : []
    if (kept.length === 0 && selectors.length === 0 && links.length > 0) continue
    next[chainId] = kept.length === links.length ? chain : { ...chain, links: kept }
  }
  if (removed === 0 || settings === undefined) return removed
  await settings.mutate(ORCHESTRATION_NS, [{ op: 'set', path: ['chains'], value: next }], revisionOf(settings, ORCHESTRATION_NS))
  return removed
}

/** What one removal changed. */
export interface RemovalSummary {
  routeRemoved: boolean
  credentialRemoved: boolean
  poolStateRemoved: boolean
  cacheEntryRemoved: boolean
  chainLinksRemoved: number
  teardown: { ran: boolean; ok: boolean; failedStep?: string; output: string }
  errors: string[]
}

/**
 * Remove every trace of a heavy provider: optional local teardown, then the
 * DSH route, credential reference, pool state, discovered-cache entry, and
 * chain links. Every sub-step is fail-soft and reported in the summary.
 */
export async function removeProvider(
  deps: HeavyDeps,
  manifest: HeavyProviderManifest,
  options: { uninstall?: boolean } = {},
): Promise<RemovalSummary> {
  const errors: string[] = []
  let teardown: RemovalSummary['teardown'] = { ran: false, ok: true, output: '' }
  if (options.uninstall === true && manifest.removal.steps.length > 0) {
    let output = ''
    let ok = true
    let failedStep: string | undefined
    for (const step of manifest.removal.steps) {
      try {
        const outcome = await deps.runStep(step)
        output += `$ ${step.label}\n${outcome.output}\n`
        if (outcome.exitCode !== 0 && step.optional !== true) {
          ok = false
          failedStep = step.label
          break
        }
      } catch (error) {
        if (step.optional === true) {
          output += `$ ${step.label} (optional, failed: ${error instanceof Error ? error.message : String(error)})\n`
          continue
        }
        ok = false
        failedStep = step.label
        output += `$ ${step.label} (failed: ${error instanceof Error ? error.message : String(error)})\n`
        break
      }
    }
    teardown = { ran: true, ok, ...failedStep === undefined ? {} : { failedStep }, output }
  }

  let routeRemoved = false
  if (deps.settings !== undefined && configuredProfile(deps, manifest.id) !== undefined) {
    try {
      await deps.settings.mutate(LLM_NS, [{ op: 'unset', path: ['providers', manifest.id] }], revisionOf(deps.settings, LLM_NS))
      routeRemoved = true
    } catch (error) {
      errors.push(`route: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let credentialRemoved = false
  if (deps.credentials !== undefined && manifest.auth.apiKeyEnv !== undefined) {
    try {
      await deps.credentials.unset(manifest.auth.apiKeyEnv)
      credentialRemoved = true
    } catch (error) {
      errors.push(`credential: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const poolStateRemoved = removePoolState(deps, manifest.id)
  const cacheEntryRemoved = removeDiscoveredEntry(deps, manifest.id)
  let chainLinksRemoved = 0
  try {
    chainLinksRemoved = await removeChainReferences(deps, manifest.id)
  } catch (error) {
    errors.push(`chains: ${error instanceof Error ? error.message : String(error)}`)
  }

  return { routeRemoved, credentialRemoved, poolStateRemoved, cacheEntryRemoved, chainLinksRemoved, teardown, errors }
}
