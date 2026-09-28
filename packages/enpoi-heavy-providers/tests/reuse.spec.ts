/**
 * Reuse-on-server: health-probe first, write the route, store the key only
 * when one was supplied. The probe is fail-soft — a down service is reported,
 * never used to block the add.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { manifestById } from '../src/manifests.js'
import {
  discoverModels,
  reuseOnServer,
  routeProfile,
  type CredentialsSeam,
  type FetchLike,
  type HeavyDeps,
  type SettingsSeam,
} from '../src/planner.js'

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A deps bundle with recording settings/credentials and an injectable fetch. */
function depsWith(options: { fetch: FetchLike; withSettings?: boolean; withCredentials?: boolean }): {
  deps: HeavyDeps
  mutations: Array<{ ns: string; ops: readonly Record<string, unknown>[] }>
  credentialSets: Array<{ ref: string; value: string }>
} {
  const mutations: Array<{ ns: string; ops: readonly Record<string, unknown>[] }> = []
  const credentialSets: Array<{ ref: string; value: string }> = []
  const scratchDir = mkdtempSync(join(tmpdir(), 'heavy-reuse-'))
  scratch.push(scratchDir)
  const settings: SettingsSeam = {
    describe: () => [{ ns: 'llm-pi-ai', revision: 7, value: { providers: {} } }],
    mutate: async (ns, ops) => { mutations.push({ ns, ops }) },
  }
  const credentials: CredentialsSeam = {
    resolve: async () => undefined,
    set: async (ref, value) => { credentialSets.push({ ref, value }) },
    unset: async () => {},
  }
  const deps: HeavyDeps = {
    home: scratchDir,
    dshHome: join(scratchDir, '.dsh'),
    ...options.withSettings === false ? {} : { settings },
    ...options.withCredentials === false ? {} : { credentials },
    fetchImpl: options.fetch,
    runStep: async () => ({ exitCode: 0, output: '' }),
  }
  return { deps, mutations, credentialSets }
}

it('reuse probes health, discovers models, writes the route, and stores the key', async () => {
  const calls: string[] = []
  const fetch: FetchLike = vi.fn(async (url) => {
    calls.push(url)
    if (url.endsWith('/api/ping')) return { ok: true, status: 200, text: async () => '{"status":"ok"}' }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: 'auto' }, { id: 'glm-5.2', name: 'GLM 5.2' }] }),
    }
  })
  const { deps, mutations, credentialSets } = depsWith({ fetch })
  const manifest = manifestById('freellmapi')!
  const outcome = await reuseOnServer(deps, manifest, 'sk-unified')

  expect(calls[0]).toBe('http://100.122.163.25:3002/api/ping')
  expect(calls[1]).toBe('http://100.122.163.25:3002/v1/models')
  expect(outcome.health.ok).toBe(true)
  expect(outcome.models.map(model => model.id)).toEqual(['auto', 'glm-5.2'])
  expect(mutations).toHaveLength(1)
  const written = mutations[0]!.ops[0] as { op: string; path: string[]; value: Record<string, unknown> }
  expect(written.op).toBe('set')
  expect(written.path).toEqual(['providers', 'freellmapi'])
  expect(written.value.baseURL).toBe('http://100.122.163.25:3002/v1')
  expect(written.value.api).toBe('openai-completions')
  expect(written.value.displayName).toBe('FreeLLMAPI (server)')
  expect(written.value.models).toEqual([{ id: 'auto' }, { id: 'glm-5.2', name: 'GLM 5.2' }])
  expect(credentialSets).toEqual([{ ref: 'FREELLMAPI_API_KEY', value: 'sk-unified' }])
})

it('reuse still writes the route when the health probe is down (fail-soft)', async () => {
  const fetch: FetchLike = vi.fn(async (url) => {
    if (url.endsWith('/api/ping')) throw new Error('ECONNREFUSED')
    return { ok: false, status: 401, text: async () => 'unauthorized' }
  })
  const { deps, mutations } = depsWith({ fetch })
  const outcome = await reuseOnServer(deps, manifestById('freellmapi')!, undefined)

  expect(outcome.health.ok).toBe(false)
  expect(outcome.health.error).toContain('ECONNREFUSED')
  expect(mutations).toHaveLength(1)
  // Discovery was refused (401) → the manifest's fallback model keeps the
  // route resolvable.
  const value = (mutations[0]!.ops[0] as { value: { models: unknown } }).value
  expect(value.models).toEqual([{ id: 'auto' }])
})

it('antigravity reuse writes a placeholder anthropic route with no pool and never keyless', () => {
  const profile = routeProfile(manifestById('antigravity')!, 'reuse', [])
  expect(profile.api).toBe('anthropic-messages')
  expect(profile.apiKeyEnv).toBe('ANTIGRAVITY_API_KEY')
  expect(profile.keyless).toBeUndefined()
  expect(profile).not.toHaveProperty('pool')
  expect(profile.baseURL).toBe('http://100.122.163.25:8082')
  expect(profile.models).toEqual([{ id: 'gemini-2.5-flash' }])
})

it('writes nothing (and rejects) when the settings seam is absent', async () => {
  const fetch: FetchLike = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"data":[]}' }))
  const { deps, mutations } = depsWith({ fetch, withSettings: false })
  await expect(reuseOnServer(deps, manifestById('freellmapi')!, undefined)).rejects.toThrow('settings seam absent')
  expect(mutations).toHaveLength(0)
})

it('discovery returns [] for an unreachable endpoint instead of throwing', async () => {
  const fetch: FetchLike = vi.fn(async () => { throw new Error('boom') })
  await expect(discoverModels('http://127.0.0.1:1/v1', undefined, fetch)).resolves.toEqual([])
})
