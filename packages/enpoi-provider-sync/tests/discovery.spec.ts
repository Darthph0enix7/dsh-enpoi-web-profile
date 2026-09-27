import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  describeSyncFailure,
  discoveredCachePath,
  fetchModels,
  isCatalogRoute,
  mergeDiscoveredModels,
  mergeDiscoveredRoute,
  normalizeListingEntry,
  writeDiscoveredRoute,
} from '../src/index.ts'

const servers: Server[] = []
const directories: string[] = []

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'DSH_DISCOVERED_MODELS')
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** Serve one scripted `GET /models` reply and record that it was asked. */
async function listingServer(status: number, body: string): Promise<{ url: string; paths: string[] }> {
  const paths: string[] = []
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    paths.push(request.url ?? '')
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return { url: `http://127.0.0.1:${String(address.port)}`, paths }
}

/** One Kilo-shaped `:free` model, fully disclosed. */
const DISCLOSED = {
  id: 'vendor/model:free',
  name: 'Vendor Model (Free)',
  context_length: 131_072,
  top_provider: { context_length: 131_072, max_completion_tokens: 8192 },
  architecture: { input_modalities: ['text', 'image'] },
  supported_parameters: ['tools', 'reasoning'],
  pricing: { prompt: '0', completion: '0' },
  isFree: true,
}

/** A row that discloses nothing but its id. */
const UNDISCLOSED = { id: 'zzz-mystery-endpoint-model-77' }

describe('listing normalization', () => {
  it('reads capacities, modalities, tools, pricing, and free-ness, and dedupes ids', async () => {
    const { url, paths } = await listingServer(200, JSON.stringify({ data: [DISCLOSED, DISCLOSED, UNDISCLOSED, { not: 'a model' }] }))
    const live = await fetchModels(url, undefined)
    expect(paths).toEqual(['/models'])
    expect(live.map(model => model.id)).toEqual(['vendor/model:free', 'zzz-mystery-endpoint-model-77'])
    expect(live[0]).toEqual({
      id: 'vendor/model:free',
      name: 'Vendor Model (Free)',
      contextWindow: 131_072,
      maxTokens: 8192,
      input: ['text', 'image'],
      tools: true,
      reasoning: true,
      pricing: { prompt: '0', completion: '0' },
      isFree: true,
    })
    // An id-only row stays id-only: nothing is invented for it.
    expect(live[1]).toEqual({ id: 'zzz-mystery-endpoint-model-77' })
    expect(normalizeListingEntry({ id: 'x', supported_parameters: ['temperature'] }))
      .toMatchObject({ id: 'x', tools: false, reasoning: false })
  })
})

describe('discovered-cache records', () => {
  it('marks a model nothing described as unverified and keeps it at the capability floor', () => {
    const [record] = mergeDiscoveredModels('kilo', [{ id: 'zzz-mystery-endpoint-model-77' }], undefined)
    expect(record).toEqual({ id: 'zzz-mystery-endpoint-model-77', name: 'Zzz Mystery Endpoint Model 77', contextWindow: 262_144, maxTokens: 32_768, unverified: true })
    const [known] = mergeDiscoveredModels('kilo', [{ id: 'vendor/model:free', input: ['text', 'image'], tools: true }], undefined)
    expect(known).toMatchObject({ input: ['text', 'image'], tools: true })
    expect(known?.unverified).toBeUndefined()
  })

  it('is idempotent: an unchanged listing keeps every discoveredAt and fetchedAt', () => {
    const models = mergeDiscoveredModels('kilo', [{ id: 'a' }, { id: 'b' }], undefined)
    const first = mergeDiscoveredRoute(undefined, 'https://kilo.test', models, 1000)
    expect(first.models.map(model => model.discoveredAt)).toEqual([1000, 1000])
    const second = mergeDiscoveredRoute(first, 'https://kilo.test', models, 2000)
    expect(second).toEqual(first)
    expect(second.fetchedAt).toBe(1000)
    // A changed entry re-stamps only itself; its siblings keep their stamp.
    const changed = mergeDiscoveredRoute(first, 'https://kilo.test', [{ ...models[0]!, name: 'renamed' }, models[1]!], 2000)
    expect(changed.models.map(model => model.discoveredAt)).toEqual([2000, 1000])
    expect(changed.fetchedAt).toBe(2000)
  })

  it('writes the cache atomically and byte-identically for an unchanged listing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-sync-'))
    directories.push(directory)
    process.env.DSH_DISCOVERED_MODELS = join(directory, 'discovered-models.json')
    const record = mergeDiscoveredRoute(undefined, 'https://kilo.test', mergeDiscoveredModels('kilo', [{ id: 'a' }], undefined), 1234)
    writeDiscoveredRoute('kilo', record)
    const first = readFileSync(discoveredCachePath(), 'utf8')
    writeDiscoveredRoute('kilo', mergeDiscoveredRoute(record, 'https://kilo.test', mergeDiscoveredModels('kilo', [{ id: 'a' }], undefined), 9999))
    expect(readFileSync(discoveredCachePath(), 'utf8')).toBe(first)
    expect(JSON.parse(first).routes.kilo).toMatchObject({ fetchedAt: 1234, models: [{ id: 'a', source: 'discovered', discoveredAt: 1234 }] })
  })
})

describe('honest fallbacks', () => {
  it('reports a failed fetch with the manual affordance, and never writes a record', async () => {
    const { url } = await listingServer(503, '{"error":"down"}')
    let error: unknown
    try {
      await fetchModels(url, undefined)
    } catch (caught) {
      error = caught
    }
    const advice = describeSyncFailure('kilo', error)
    expect(advice).toContain('sync failed')
    expect(advice).toContain('HTTP 503')
    expect(advice).toContain('add models manually on the Models page')
    expect(advice).toContain('llm-pi-ai.providers["kilo"].models')
  })

  it('knows which routes the installed catalog already describes', () => {
    expect(isCatalogRoute('deepseek')).toBe(true)
    expect(isCatalogRoute('kilo')).toBe(false)
  })
})
