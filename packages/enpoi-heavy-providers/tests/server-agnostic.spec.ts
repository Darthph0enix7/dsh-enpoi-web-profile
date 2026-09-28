/**
 * SHIPPED-DEFAULT CORRECTNESS: the end user has no server, so the shipped
 * manifest table may name no operator address, hostname, or path — every
 * manifest URL is loopback, and the source modules that ship carry none of
 * our addresses either. An operator's own endpoints belong in the private
 * `$DSH_HOME/heavy-server-overlay.json`, never in this package.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { HEAVY_MANIFESTS } from '../src/manifests.js'

const FORBIDDEN = [
  /100\.122\.163\.25/,
  /enpoi\.vip/i,
  /serverlocal/i,
  /tailscale/i,
  /\/home\/adam\b/,
]

/** Every string reachable from one value, in order. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(strings)
  }
  return []
}

it('the shipped manifest table names no operator address, hostname, or path', () => {
  const serialized = JSON.stringify(HEAVY_MANIFESTS)
  for (const pattern of FORBIDDEN) {
    expect(serialized, `shipped manifests must not match ${String(pattern)}`).not.toMatch(pattern)
  }
})

it('every manifest URL is loopback', () => {
  for (const manifest of HEAVY_MANIFESTS) {
    const urls = [
      manifest.reuse.baseURL,
      manifest.reuse.health.url,
      manifest.local.baseURL,
      ...manifest.dashboardUrl === undefined ? [] : [manifest.dashboardUrl],
      ...manifest.local.dashboardUrl === undefined ? [] : [manifest.local.dashboardUrl],
      ...manifest.unsupported === undefined ? [] : [manifest.unsupported.reuseUrl],
    ].filter(url => url !== '')
    for (const url of urls) {
      expect(new URL(url).hostname, `${manifest.id}: ${url}`).toBe('127.0.0.1')
    }
  }
})

it('the shipping source modules carry none of the operator addresses either', () => {
  const src = fileURLToPath(new URL('../src', import.meta.url))
  const files = readdirSync(src).filter(name => name.endsWith('.ts'))
  expect(files.length).toBeGreaterThan(0)
  for (const name of files) {
    const text = readFileSync(`${src}/${name}`, 'utf8')
    for (const pattern of FORBIDDEN) {
      expect(text, `${name} must not match ${String(pattern)}`).not.toMatch(pattern)
    }
  }
})
