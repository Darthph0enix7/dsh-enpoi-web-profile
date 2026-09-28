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

it('antigravity is a loopback anthropic route with a placeholder ref, never keyless', () => {
  const manifest = manifestById('antigravity')
  expect(manifest?.protocol).toBe('anthropic-messages')
  expect(manifest?.auth).toEqual({ kind: 'placeholder', apiKeyEnv: 'ANTIGRAVITY_API_KEY', keyless: false })
  expect(manifest?.reuse.baseURL).toBe('http://127.0.0.1:8082')
  expect(manifest?.local.baseURL).toBe('http://127.0.0.1:8082')
  expect(manifest?.defaultPort).toBe(8082)
})

it('antigravity removal warns about other proxy consumers and a synced unit file', () => {
  const warnings = manifestById('antigravity')?.removal.warnings.join('\n') ?? ''
  expect(warnings).toContain('other tool')
  expect(warnings).toContain('dotfiles')
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

it('commandcode is a served custom-protocol route on its own settings namespace', () => {
  const manifest = manifestById('commandcode')
  expect(manifest?.unsupported).toBeUndefined()
  expect(manifest?.reuse.baseURL).toBe('http://127.0.0.1:8899/commandcode')
  expect(manifest?.protocol).toBe('commandcode/alpha-generate')
  // llm-pi-ai cannot parse this protocol; the profile must go elsewhere.
  expect(manifest?.settingsNs).toBe('commandcode-provider')
  expect(manifest?.local.baseURL).toBe('http://127.0.0.1:8899/commandcode')
  expect(manifest?.local.install.default.steps.length).toBeGreaterThan(0)
})

it('commandcode local install wires the provider package and the keypool', () => {
  const commands = manifestById('commandcode')!.local.install.default.steps.map(step => step.command).join('\n')
  expect(commands).toContain('enpoi-commandcode-provider/scripts/install.mjs')
  expect(commands).toContain('keypool-seed.mjs')
  expect(commands).toContain('keypool.service')
})

it('a served non-llm-pi-ai protocol without settingsNs is a manifest problem', () => {
  const broken = { ...manifestById('commandcode')!, settingsNs: undefined }
  expect(manifestProblems([broken]).some(problem => problem.includes('settingsNs'))).toBe(true)
})

it('commandcode removal drops only the commandcode pool, never the shared keypool service', () => {
  const manifest = manifestById('commandcode')
  const commands = manifest?.removal.steps.map(step => step.command).join('\n') ?? ''
  expect(commands).toContain('keypool-remove.mjs')
  expect(commands).not.toContain('systemctl')
  expect(commands).not.toContain('rm -rf')
  const text = JSON.stringify(manifest?.removal)
  expect(text).toContain('never stops or removes the shared keypool service')
  expect(text).toContain('usage.jsonl')
})

it('commandcode descriptions keep the keypool, package, removal, and quota facts', () => {
  const quirks = manifestById('commandcode')?.quirks.join('\n') ?? ''
  expect(quirks).toContain('Proxy use detected')
  expect(quirks).toContain('dsh-enpoi-commandcode-provider')
  expect(quirks).toContain('never stop or remove the shared keypool service')
  expect(quirks).toContain('QUOTA failure')
  expect(manifestById('commandcode')?.reuse.note).toContain('provider package')
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
