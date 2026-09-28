/**
 * enpoi-heavy-providers — the `enpoiHeavy` Typert Remote namespace.
 *
 * Decorated shell over `planner.ts`/`jobs.ts`: the client's Add Provider and
 * provider-detail surfaces drive install/reuse/removal exclusively through
 * these endpoints, so a long install never sits in the `settings.mutate`
 * path. All payload validation happens here at the wire boundary.
 *
 * @module dsh-enpoi-heavy-providers/remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { HeavyJobView } from './jobs.js'
import { HeavyJobManager } from './jobs.js'
import { HEAVY_MANIFESTS, manifestById, manifestProblems, type HeavyProviderManifest } from './manifests.js'
import {
  configuredProfile,
  discoverModels,
  modeBaseURL,
  modeHealth,
  probeHealth,
  removeProvider,
  reuseOnServer,
  storeCredential,
  writeRoute,
  type HeavyDeps,
  type ReuseOutcome,
  type RemovalSummary,
} from './planner.js'

/** Longest accepted key string (a credential is a bounded token). */
const MAX_KEY_CHARS = 4096

/** The host seams the service reads lazily (each may mount after this plugin). */
export interface HeavyServiceOptions {
  /** Current deps; read per call so late-mounted services are seen. */
  deps: () => HeavyDeps
  /** The shared job manager (one install per provider at a time). */
  jobs: HeavyJobManager
  /** Diagnostics sink; defaults to no logging. */
  log?: (line: string) => void
}

/** `enpoiHeavy.manifests` result. */
export interface ManifestsValue {
  items: readonly HeavyProviderManifest[]
  problems: readonly string[]
}

/** `enpoiHeavy.status` result. */
export interface StatusValue {
  id: string
  configured: boolean
  mode?: 'reuse' | 'local'
  health: { ok: boolean; status?: number; error?: string; checkedAt: number }
  unsupported?: HeavyProviderManifest['unsupported']
  job?: HeavyJobView
}

/** `enpoiHeavy.reuse` result. */
export interface ReuseValue extends Partial<ReuseOutcome> {
  ok: boolean
  blocked?: { reason: string; plannedWith: string }
}

/** `enpoiHeavy.install` result. */
export interface InstallValue {
  ok: boolean
  job?: HeavyJobView
  blocked?: { reason: string; plannedWith: string }
}

/** `enpoiHeavy.job` result. */
export interface JobValue {
  job?: HeavyJobView
}

/** `enpoiHeavy.remove` result. */
export interface RemoveValue {
  ok: boolean
  summary?: RemovalSummary
}

/** Validate one wire id against the manifest table. */
function requireManifest(value: unknown): HeavyProviderManifest {
  if (typeof value !== 'string' || value === '') {
    throw new RemoteError('gateway/bad-request', 'enpoiHeavy: id must be a non-empty string', {})
  }
  const manifest = manifestById(value)
  if (manifest === undefined) {
    throw new RemoteError('gateway/bad-request', `enpoiHeavy: unknown heavy provider "${value}"`, {})
  }
  return manifest
}

/** Normalize an optional key argument. */
function optionalKey(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new RemoteError('gateway/bad-request', 'enpoiHeavy: key must be a string', {})
  if (value.length > MAX_KEY_CHARS) throw new RemoteError('gateway/bad-request', 'enpoiHeavy: key is too long', {})
  return value
}

/** The service behind the `enpoiHeavy` Remote namespace. */
export class HeavyProvidersService extends TypertRemoteService {
  /** Nothing is injected into the service fiber; the plugin passes its deps. */
  static inject: string[] = []

  private readonly options: HeavyServiceOptions

  /**
   * @param ctx - owning context (service registration is automatic).
   * @param options - deps accessor, job manager, and optional log sink.
   */
  constructor(ctx: Context, options: HeavyServiceOptions) {
    super(ctx, 'enpoiHeavy')
    this.options = options
  }

  /** The declared manifest table plus any structural problems (display only). */
  @Remote
  manifests(): ManifestsValue {
    return { items: HEAVY_MANIFESTS, problems: manifestProblems() }
  }

  /**
   * One provider's configured/health/job state.
   * @param request - `{ id }`.
   * @returns the status fold; a probe failure is reported, never thrown.
   */
  @Remote
  async status(request: { id?: unknown }): Promise<StatusValue> {
    const manifest = requireManifest(request?.id)
    const deps = this.options.deps()
    const profile = configuredProfile(deps, manifest.id)
    const configured = profile !== undefined
    const configuredBase = typeof profile?.baseURL === 'string' ? profile.baseURL : undefined
    const mode = configuredBase === undefined ? undefined : configuredBase === manifest.reuse.baseURL ? 'reuse' : 'local'
    const health = await probeHealth(mode === undefined ? manifest.reuse.health : modeHealth(manifest, mode), deps.fetchImpl)
    const job = this.options.jobs.snapshot(manifest.id)
    return {
      id: manifest.id,
      configured,
      ...mode === undefined ? {} : { mode },
      health,
      ...manifest.unsupported === undefined ? {} : { unsupported: manifest.unsupported },
      ...job === undefined ? {} : { job },
    }
  }

  /**
   * Add by reuse: probe the server endpoint, discover models, write the route.
   * @param request - `{ id, key? }`.
   * @returns the route written, the probe verdict, and whether a key was stored.
   */
  @Remote
  async reuse(request: { id?: unknown; key?: unknown }): Promise<ReuseValue> {
    const manifest = requireManifest(request?.id)
    const key = optionalKey(request?.key)
    if (manifest.unsupported !== undefined) {
      return { ok: false, blocked: { reason: manifest.unsupported.reason, plannedWith: manifest.unsupported.plannedWith } }
    }
    const outcome = await reuseOnServer(this.options.deps(), manifest, key)
    this.options.log?.(`reuse ${manifest.id}: health=${outcome.health.ok ? 'ok' : 'down'} models=${String(outcome.models.length)}`)
    return { ok: true, ...outcome }
  }

  /**
   * Add by local install: start the polled job; the route is written only when
   * every required step succeeds.
   * @param request - `{ id, key? }`.
   * @returns the initial job snapshot, or the unsupported blocker.
   */
  @Remote
  install(request: { id?: unknown; key?: unknown }): InstallValue {
    const manifest = requireManifest(request?.id)
    const key = optionalKey(request?.key)
    if (manifest.unsupported !== undefined) {
      return { ok: false, blocked: { reason: manifest.unsupported.reason, plannedWith: manifest.unsupported.plannedWith } }
    }
    const job = this.options.jobs.start(manifest.id, 'install', manifest.local.install, async () => {
      const deps = this.options.deps()
      const models = await discoverModels(modeBaseURL(manifest, 'local'), key, deps.fetchImpl)
      await writeRoute(deps, manifest, 'local', models)
      await storeCredential(deps, manifest, key)
    })
    return { ok: true, job }
  }

  /**
   * Poll one provider's current job snapshot.
   * @param request - `{ id }`.
   * @returns the snapshot, or nothing when no job ever ran.
   */
  @Remote
  job(request: { id?: unknown }): JobValue {
    const manifest = requireManifest(request?.id)
    const job = this.options.jobs.snapshot(manifest.id)
    return job === undefined ? {} : { job }
  }

  /**
   * Remove one provider: optional local teardown, then route, credential,
   * pool state, discovered-cache entry, and chain links.
   * @param request - `{ id, uninstall? }`.
   * @returns what was removed; individual sub-failures land in `summary.errors`.
   */
  @Remote
  async remove(request: { id?: unknown; uninstall?: unknown }): Promise<RemoveValue> {
    const manifest = requireManifest(request?.id)
    if (request?.uninstall !== undefined && typeof request.uninstall !== 'boolean') {
      throw new RemoteError('gateway/bad-request', 'enpoiHeavy: uninstall must be a boolean', {})
    }
    const summary = await removeProvider(this.options.deps(), manifest, { uninstall: request?.uninstall === true })
    this.options.log?.(`remove ${manifest.id}: route=${String(summary.routeRemoved)} pool=${String(summary.poolStateRemoved)} cache=${String(summary.cacheEntryRemoved)} teardown=${String(summary.teardown.ok)}`)
    return { ok: summary.errors.length === 0, summary }
  }
}
