import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Profile-patch advertisement guard for the 2026-09-26 error-audit defects and
 * the 2026-09-27 OpenCode free-tier rejection.
 *
 * The composed `cordis.patch.yml` is the deployment's route table and tool
 * presentation; two of its rows produced every unexplained error of the
 * baseline and neither is covered by a package unit test (they are profile
 * configuration, not plugin code). This spec reads the patch as text and
 * asserts the facts the fixes pinned:
 *
 * 1. `run_code` is not advertised: every `tool-presentation` row presents
 *    `native`, because PTC execution is not enabled (no `run_code` policy
 *    grant; mounting it needs Adam's word).
 * 2. The `free` chain (all links are `opencode` free-tier models that answer
 *    `403 FreeTierError` to harness calls) stays retired via `disabled: true`,
 *    and no default seat or enabled chain may route back into it. OpenCode
 *    gates the free tier server-side to its own clients — "You cannot use the
 *    free tier in other harnesses" (anomalyco/opencode#49621) — so a
 *    settings rewrite that resurrects the links must fail here. The
 *    `scripts/disable-free-tier.mjs` repair is idempotent on the same text.
 *
 * 3. Every enabled chain is checked link-by-link for `opencode/*-free` at any
 *    indentation, and every `chain:` reference anywhere in the patch must name
 *    a declared, enabled group — a seat naming a disabled chain fails.
 */

const PATCH = readFileSync(new URL('../../../cordis.patch.yml', import.meta.url), 'utf8')

/** The indented block that follows one `key:` line inside a parent mapping. */
function blockAfter(source: string, key: string): string {
  const start = source.indexOf(`\n      ${key}:\n`)
  if (start === -1) throw new Error(`profile patch has no "${key}" entry`)
  const rest = source.slice(start + 1)
  const end = rest.search(/\n {4}[a-z]/)
  return end === -1 ? rest : rest.slice(0, end + 1)
}

/** The block of one top-level `- id: <id>` row. */
function rowAfter(source: string, id: string): string {
  const start = source.indexOf(`\n- id: ${id}\n`)
  if (start === -1) throw new Error(`profile patch has no top-level row "${id}"`)
  const rest = source.slice(start + 1)
  const end = rest.search(/\n- id:/)
  return end === -1 ? rest : rest.slice(0, end + 1)
}

/** Every `      <id>:` chain entry inside the `enpoi-orchestration.chains` map. */
function chainBlocks(source: string): Array<{ id: string; body: string }> {
  const map = source.indexOf('\n    chains:\n')
  if (map === -1) throw new Error('profile patch has no enpoi-orchestration chains map')
  const rest = source.slice(map + 1)
  const stop = rest.search(/\n {4}[A-Za-z0-9_@./-]+:/)
  const scope = stop === -1 ? rest : rest.slice(0, stop)
  return [...scope.matchAll(/\n {6}([A-Za-z0-9_@./-]+):\n/g)].map(match => ({
    id: match[1]!,
    body: blockAfter(source, match[1]!),
  }))
}

/** Whether one chain block declares itself retired. */
function chainDisabled(body: string): boolean {
  return /^[ \t]*disabled:[ \t]*true[ \t]*$/m.test(body)
}

/** Every `- provider:` / `model:` link pair in one chain block, at any indentation. */
function chainLinks(body: string): Array<{ provider: string; model: string }> {
  return [...body.matchAll(/^[ \t]*- provider: (\S+)\n[ \t]*model: (\S+)/gm)]
    .map(match => ({ provider: match[1]!, model: match[2]! }))
}

describe('web profile patch advertisement guard', () => {
  it('presents every tool-presentation row as native (run_code is not advertised)', () => {
    const rows = PATCH.split('- id: tool-presentation').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const config = row.slice(0, row.indexOf('\n\n'))
      expect(config).toContain('mode: native')
      expect(config).not.toContain('mode: both')
      expect(config).not.toContain('mode: ptc')
    }
  })

  it('keeps the dead opencode free-tier chain retired', () => {
    const free = blockAfter(PATCH, 'free')
    expect(free).toContain('label: Free')
    expect(free).toContain('disabled: true')
    expect(free).not.toContain('disabled: false')
    // The dead links stay visible for the operator to repair.
    expect(free).toContain('model: ling-3.0-flash-fin-free')
  })

  it('keeps every default seat and enabled chain off the gated opencode free tier', () => {
    const chains = chainBlocks(PATCH)
    const declared = new Map(chains.map(chain => [chain.id, chain]))

    // The default seat: paid route only, no chain fallback into free links.
    const seat = rowAfter(PATCH, 'agent-default-model')
    expect(seat).not.toMatch(/^\s+chain:/m)
    expect(seat).not.toMatch(/model: .*-free/)

    // No enabled group may link a gated model, at any indentation; disabled
    // groups may keep their dead links visible (the `free` chain is the only one).
    for (const { id, body } of chains) {
      if (chainDisabled(body)) continue
      for (const { provider, model } of chainLinks(body)) {
        expect(
          provider !== 'opencode' || !model.endsWith('-free'),
          `enabled chain "${id}" must not link gated free model ${provider}/${model}`,
        ).toBe(true)
      }
    }

    // Every `chain:` reference (any seat, any depth) must name a declared,
    // enabled group; a disabled or missing target cannot route.
    for (const match of PATCH.matchAll(/^[ \t]*chain:[ \t]*(\S+?)[ \t]*(?:#.*)?$/gm)) {
      const id = match[1]!.replace(/^["']|["']$/g, '')
      const target = declared.get(id)
      expect(
        target !== undefined && !chainDisabled(target.body),
        `chain reference "${id}" must name a declared, enabled group`,
      ).toBe(true)
    }
  })
})
