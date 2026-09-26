import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Profile-patch advertisement guard for the 2026-09-26 error-audit defects.
 *
 * The composed `cordis.patch.yml` is the deployment's route table and tool
 * presentation; two of its rows produced every unexplained error of the
 * baseline and neither is covered by a package unit test (they are profile
 * configuration, not plugin code). This spec reads the patch as text and
 * asserts the two facts the fix pinned:
 *
 * 1. `run_code` is not advertised: every `tool-presentation` row presents
 *    `native`, because PTC execution is not enabled (no `run_code` policy
 *    grant; mounting it needs Adam's word).
 * 2. The `free` chain (all links are `opencode` free-tier models that answer
 *    `403 FreeTierError` to harness calls) stays retired via `disabled: true`.
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
})
