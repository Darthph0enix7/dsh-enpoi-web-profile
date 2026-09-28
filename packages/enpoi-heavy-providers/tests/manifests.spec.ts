/**
 * Manifest-table invariants: every heavy provider is fully declared, the
 * antigravity route never opts into DSH key pooling, and commandcode ships as
 * an explicit unsupported-but-documented reuse path.
 */
import { expect, it } from 'vitest'
import { HEAVY_MANIFESTS, manifestById, manifestProblems, resolveHeavyInstall } from '../src/manifests.js'

it('declares the three heavy providers with no structural problems', () => {
  expect(manifestProblems()).toEqual([])
  expect(HEAVY_MANIFESTS.map(manifest => manifest.id)).toEqual(['freellmapi', 'antigravity', 'commandcode'])
})

it('keeps every manifest free of DSH key-pool declarations', () => {
  const serialized = JSON.stringify(HEAVY_MANIFESTS)
  expect(serialized).not.toContain('"pool"')
  expect(serialized).not.toContain('identities')
})

it('antigravity is an anthropic route with a placeholder ref, never keyless', () => {
  const manifest = manifestById('antigravity')
  expect(manifest?.protocol).toBe('anthropic-messages')
  expect(manifest?.auth).toEqual({ kind: 'placeholder', apiKeyEnv: 'ANTIGRAVITY_API_KEY', keyless: false })
  expect(manifest?.reuse.baseURL).toBe('http://100.122.163.25:8082')
  expect(manifest?.local.baseURL).toBe('http://127.0.0.1:8082')
})

it('antigravity removal warns about OpenCode and the dotfiles-managed unit', () => {
  const warnings = manifestById('antigravity')?.removal.warnings.join('\n') ?? ''
  expect(warnings).toContain('OpenCode')
  expect(warnings).toContain('op pull')
})

it('freellmapi removal drops the volume, the image, and the clone directory', () => {
  const steps = manifestById('freellmapi')?.removal.steps.map(step => step.command).join('\n') ?? ''
  expect(steps).toContain('docker compose down -v')
  expect(steps).toContain('docker image rm')
  expect(steps).toContain('rm -rf {home}/freellmapi')
})

it('freellmapi surface quirks name the unified key and ENCRYPTION_KEY', () => {
  const quirks = manifestById('freellmapi')?.quirks.join('\n') ?? ''
  expect(quirks).toContain('Unified key')
  expect(quirks).toContain('ENCRYPTION_KEY')
  expect(manifestById('freellmapi')?.requiresBrowser.length).toBeGreaterThan(0)
})

it('commandcode is unsupported for llm-pi-ai but documents the keypool reuse URL', () => {
  const manifest = manifestById('commandcode')
  expect(manifest?.unsupported?.reuseUrl).toBe('http://100.122.163.25:8899/commandcode')
  expect(manifest?.reuse.baseURL).toBe('http://100.122.163.25:8899/commandcode')
  expect(manifest?.protocol).toBe('commandcode/alpha-generate')
  expect(manifest?.local.install.default.steps).toEqual([])
})

it('commandcode removal only touches DSH state, never the shared keypool service', () => {
  const manifest = manifestById('commandcode')
  expect(manifest?.removal.steps).toEqual([])
  const text = JSON.stringify(manifest?.removal)
  expect(text).toContain('never stops or removes the shared keypool service')
  expect(text).toContain('usage.jsonl')
})

it('freellmapi installs are platform-keyed and fall back to the Docker path', () => {
  const local = manifestById('freellmapi')!.local
  const linux = resolveHeavyInstall(local, 'linux')
  expect(linux.steps[0]!.command).toContain('freellmapi.co/install.sh')
  expect(linux.steps[0]!.command).toContain('PORT=3002')
  const darwin = resolveHeavyInstall(local, 'darwin')
  expect(darwin.deps).toEqual(['macOS 11+'])
  expect(darwin.steps[0]!.command).toContain('.dmg')
  expect(darwin.steps.map(step => step.command).join('\n')).toContain('"port":3002')
  const win32 = resolveHeavyInstall(local, 'win32')
  expect(win32.deps).toEqual(['Windows 10+'])
  expect(win32.steps[0]!.command).toContain('.exe')
  const unknown = resolveHeavyInstall(local, 'freebsd')
  expect(unknown.label).toBe(local.label)
  expect(unknown.steps[0]!.command).toContain('git clone')
})
