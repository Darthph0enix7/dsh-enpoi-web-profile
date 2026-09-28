/**
 * LIVE reuse proof (opt-in): `DSH_HEAVY_LIVE=1` adds freellmapi in reuse mode
 * against the real server gateway (100.122.163.25:3002) with a scratch home —
 * the live profile settings are never touched. Without the env var this file
 * self-skips, so the default suite stays hermetic.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { manifestById } from '../src/manifests.js'
import { reuseOnServer, type HeavyDeps } from '../src/planner.js'

const live = process.env.DSH_HEAVY_LIVE === '1'
const scratch = process.env.DSH_HEAVY_SCRATCH ?? join(process.cwd(), '.scratch', 'heavy-live')

it.skipIf(!live)('adds freellmapi in reuse mode against the real server', async () => {
  mkdirSync(scratch, { recursive: true })
  const mutations: Array<{ ns: string; ops: readonly Record<string, unknown>[] }> = []
  const deps: HeavyDeps = {
    home: scratch,
    dshHome: join(scratch, '.dsh'),
    settings: {
      describe: () => [{ ns: 'llm-pi-ai', revision: 1, value: { providers: {} } }],
      mutate: async (ns, ops) => { mutations.push({ ns, ops }) },
    },
    credentials: { resolve: async () => undefined, set: async () => {}, unset: async () => {} },
    runStep: async () => ({ exitCode: 0, output: 'reuse mode runs no steps' }),
  }
  const manifest = manifestById('freellmapi')!
  const outcome = await reuseOnServer(deps, manifest, undefined)

  const route = mutations[0]?.ops[0]?.value
  writeFileSync(join(scratch, 'freellmapi-route.json'), JSON.stringify(route, null, 2), 'utf8')
  console.log('[live-reuse] health:', JSON.stringify(outcome.health))
  console.log('[live-reuse] discovered models:', String(outcome.models.length))
  console.log('[live-reuse] route:', JSON.stringify(route))

  expect(outcome.health.ok).toBe(true)
  expect(mutations).toHaveLength(1)
  expect((route as { baseURL?: string }).baseURL).toBe('http://100.122.163.25:3002/v1')
})
