import { describe, expect, it, vi } from 'vitest'
import { CatalogRulesEngine } from '../src/index.ts'
import type { CatalogEntry } from '../src/rules.ts'

/** One catalogue entry. */
function entry(provider: string, id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return { provider, id, contextWindow: 200_000, input: ['text'], tools: true, ...overrides }
}

/** One mutable document pair behind a fake post-install settings state. */
function makeEngine(initialRules: unknown, initialCatalogue: CatalogEntry[]) {
  const state = { rules: initialRules, catalogue: initialCatalogue }
  const engine = new CatalogRulesEngine(() => state.rules, () => state.catalogue)
  return { state, engine }
}

describe('enpoi-catalog-rules engine', () => {
  it('answers the picker decision and the reason, and refreshes on demand', () => {
    const { state, engine } = makeEngine(
      { visibility: { hide: [{ when: { zeroPrice: true } }] } },
      [entry('p', 'free', { cost: { input: 0, output: 0 } }), entry('p', 'paid', { cost: { input: 1, output: 1 } })],
    )
    expect(engine.decide('p', 'free')).toMatchObject({ state: 'hidden', reason: 'hidden by rule: zero-price' })
    expect(engine.decide('p', 'paid')).toMatchObject({ state: 'visible', reason: null })
    expect(engine.decide('p', 'absent')).toBeUndefined()
    // A rules edit applies after refresh (settings/document-updated in production).
    state.rules = { visibility: { hide: [{ when: { zeroPrice: true } }] }, overrides: { shown: { p: ['free'] } } }
    engine.refresh()
    expect(engine.decide('p', 'free')).toMatchObject({ state: 'visible', reason: 'pinned visible (rule: zero-price)' })
  })

  it('expands selectors over the live catalogue and carries the seed privacy', () => {
    const { engine } = makeEngine(undefined, [
      entry('groq', 'free-tools', { cost: { input: 0, output: 0 } }),
      entry('google', 'trainer', { cost: { input: 0, output: 0 } }),
    ])
    const expansion = engine.expandSelector({ when: { zeroPrice: true, tools: true, noTraining: true } })
    expect(expansion.links.map(link => `${link.provider}/${link.model}`)).toEqual(['groq/free-tools'])
  })

  it('parses raw selectors through expandRawSelector (the model-chains seam)', () => {
    const { engine } = makeEngine(undefined, [entry('p', 'm', { cost: { input: 0, output: 0 } })])
    expect(engine.expandRawSelector({ when: { zeroPrice: true } }).links).toHaveLength(1)
    const malformed = engine.expandRawSelector({ when: { tools: 'yes' } })
    expect(malformed.links).toEqual([])
    expect(malformed.warnings).toHaveLength(1)
  })

  it('merges picker hiddenModels pins into the manual tier', () => {
    const engine = new CatalogRulesEngine(
      () => undefined,
      () => [entry('p', 'free', { cost: { input: 0, output: 0 } })],
      () => ({ p: ['free'] }),
    )
    expect(engine.decide('p', 'free')).toMatchObject({ state: 'hidden', source: 'manual', reason: 'hidden manually' })
  })

  it('warns once for rules that match nothing and previews a proposed edit', () => {
    const { state, engine } = makeEngine(undefined, [entry('p', 'free', { cost: { input: 0, output: 0 } })])
    expect(engine.warnings()).toEqual([])
    const diff = engine.previewRulesChange({ visibility: { hide: [{ when: { provider: 'ghost' } }] } })
    expect(diff.hiddenAdded).toEqual([])
    expect(diff.warnings.some(line => line.includes('matched no catalogue entries'))).toBe(true)
    // previewing never applies the document
    state.rules = { visibility: { hide: [] } }
    expect(engine.decide('p', 'free')!.state).toBe('visible')
  })
})

describe('enpoi-catalog-rules mount (apply)', () => {
  it('provides the catalogRules service, refreshes on both namespaces, and emits warnings once', async () => {
    const { apply } = await import('../src/index.ts')
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const listeners = new Map<string, (ns: unknown) => void>()
    let provided: CatalogRulesEngine | undefined
    const doc = {
      enpoi: { catalogRules: { visibility: { hide: [{ when: { provider: 'ghost' } }] } } },
      llm: { providers: { p: { models: [{ id: 'free', cost: { input: 0, output: 0 }, contextWindow: 100_000 }] } } },
    }
    const ctx = {
      get: (ns: string) => {
        if (ns === 'settings') {
          return {
            get: (namespace: string) => namespace === 'enpoi-orchestration' ? doc.enpoi : namespace === 'llm-pi-ai' ? doc.llm : undefined,
          }
        }
        return undefined
      },
      provide: (serviceName: string, value: CatalogRulesEngine) => {
        expect(serviceName).toBe('catalogRules')
        provided = value
        return () => undefined
      },
      on: (event: string, callback: (ns: unknown) => void) => {
        listeners.set(event, callback)
        return () => undefined
      },
    }
    apply(ctx as never)
    expect(provided).toBeDefined()
    const lines = write.mock.calls.map(call => String(call[0]))
    expect(lines).toContain('[enpoi-catalog-rules] mounted\n')
    const warningCount = lines.filter(line => line.includes('matched no catalogue entries')).length
    expect(warningCount).toBe(1)
    // A second refresh (same stale rule) must not re-emit the same warning.
    listeners.get('settings/document-updated')!('enpoi-orchestration')
    expect(write.mock.calls.map(call => String(call[0])).filter(line => line.includes('matched no catalogue entries'))).toHaveLength(1)
    expect(provided!.decide('p', 'free')).toMatchObject({ state: 'visible' })
  })
})
