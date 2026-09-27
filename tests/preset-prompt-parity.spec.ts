/**
 * Preset prompt parity — the cache-neutral switch contract for orchestrator ↔ sysadmin.
 *
 * The provider prefix cache is keyed by the exact request prefix, and the tool block plus the
 * system prompt sit before the conversation, so any per-preset byte this early rebuilds the
 * whole cached prefix on a switch (measured live: control turn-2 cacheRead 12,288 → treatment 0
 * after an orchestrator→sysadmin switch). The two preset declarations must therefore assemble
 * identical bytes up to the per-preset doctrine that `dsh-persona` renders LAST (suffix order
 * 10200): a SHARED BASE prefix + a PER-PRESET TAIL suffix.
 *
 * This spec reads the active declarations in `cordis.patch.yml` (the source the host mounts),
 * proves every other row/config is identical, and assembles both prompts through the real
 * `SystemPrompt` registry to prove the shared prefix is byte-identical and only the tail
 * differs. A future edit that puts per-preset text back into the prefix — or ships a new
 * row/config the other preset lacks — fails here instead of silently costing cache rebuilds.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt, {
  PERSONA_PREFIX_SECTION,
  PERSONA_SUFFIX_SECTION,
  renderPrompt,
  type PromptSectionOrderName,
} from '@deepseek-ai/dsh-system-prompt'
import { JSON_SCHEMA, Type, load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { TOOL_GROUPS_MENU_ORDER } from '../packages/enpoi-tool-groups/src/index.ts'
import { preAttachFor, renderMenuText, resolveToolGroups } from '../packages/enpoi-tool-groups/src/catalog.ts'

interface PresetRow {
  id: string
  name?: string
  disabled?: unknown
  config?: Record<string, unknown>
}
interface PersonaConfig {
  prefix: string
  suffix?: string
}

const JS_TAG = 'tag:yaml.org,2002:js'
const SCHEMA = JSON_SCHEMA.extend(new Type(JS_TAG, {
  kind: 'scalar',
  construct: (value: string) => ({ __js: String(value) }),
  represent: (value: unknown) => String((value as { __js?: unknown } | null)?.__js ?? ''),
}))

const PROFILE = join(dirname(fileURLToPath(import.meta.url)), '..')
const declarations = (load(readFileSync(join(PROFILE, 'cordis.patch.yml'), 'utf8'), { schema: SCHEMA }) as Array<{ insert?: Array<{ id: string; config: { plugins: PresetRow[] } }> }>)
  .flatMap(entry => entry?.insert ?? [])

const rowsOf = (seat: string): PresetRow[] =>
  declarations.find(item => item.id === `preset-${seat}`)!.config.plugins
const personaOf = (seat: string): PersonaConfig =>
  rowsOf(seat).find(row => row.id === 'persona')!.config as unknown as PersonaConfig

describe('preset prompt parity (cache-neutral switch contract)', () => {
  it('declares identical rows; only the persona text and the seat label differ', () => {
    const orchestrator = rowsOf('orchestrator')
    const sysadmin = rowsOf('sysadmin')
    expect(orchestrator.map(row => [row.id, row.name, row.disabled]))
      .toEqual(sysadmin.map(row => [row.id, row.name, row.disabled]))

    const differing = orchestrator
      .filter((row, index) => JSON.stringify(row.config ?? null) !== JSON.stringify(sysadmin[index].config ?? null))
      .map(row => row.id)
    expect(differing).toEqual(['persona', 'enpoi-orchestration'])

    // `enpoi-orchestration` differs only by the seat label, and the seat only resolves group
    // pre-attach: with the shipped catalog the rendered menu is identical for both seats.
    const catalog = resolveToolGroups(undefined)
    expect(preAttachFor(catalog, 'orchestrator')).toEqual(preAttachFor(catalog, 'sysadmin'))
    const menu = (seat: string): string => renderMenuText(catalog, new Set(preAttachFor(catalog, seat)))
    expect(menu('orchestrator')).toBe(menu('sysadmin'))
    expect(menu('orchestrator')).toContain('peer')
  })

  it('keeps identity and doctrine in the tail; the prefix is the shared base', () => {
    const orchestrator = personaOf('orchestrator')
    const sysadmin = personaOf('sysadmin')
    expect(orchestrator.prefix).toBe(sysadmin.prefix)
    expect(orchestrator.prefix.length).toBeGreaterThan(512)
    expect(orchestrator.prefix).toContain('## Tooling')
    expect(orchestrator.prefix).toContain('## Verification & Ambiguity')
    expect(orchestrator.prefix).toContain('## Communication')

    expect(orchestrator.suffix).toContain('Master Orchestrator')
    expect(orchestrator.suffix).toContain('## Delegation Doctrine')
    expect(orchestrator.suffix).toContain('## Fleet')
    expect(sysadmin.suffix).toContain('You are Sysadmin')
    expect(sysadmin.suffix).toContain('verify service state before and after every action')
    expect(orchestrator.suffix).not.toBe(sysadmin.suffix)

    expect(orchestrator.prefix).not.toContain('Master Orchestrator')
    expect(orchestrator.prefix).not.toContain('You are Sysadmin')
  })

  it('assembles identical shared prefixes and only the suffix tail differs', async () => {
    const ctx = new Context()
    // Scope keys are identities, not value objects: create each once and reuse it for the
    // scope registration and for the assembly that must see it.
    const keys = {
      orchestrator: { id: 'parity-orchestrator' },
      sysadmin: { id: 'parity-sysadmin' },
    } as const
    const scopes: Array<{ dispose: () => Promise<void> }> = []
    try {
      await ctx.plugin(SystemPrompt)
      // Injecting `systemPrompt` is how a context registers prompt sections (`ctx.systemPrompt`
      // is guarded); the sentinels land on the global layer and the personas on their scopes.
      await ctx.plugin({
        name: 'parity-setup',
        inject: ['systemPrompt'],
        apply(pluginCtx: Context): void {
          const section = (name: string, order: PromptSectionOrderName | number, text: string): void => {
            pluginCtx.systemPrompt.section({
              name,
              order: typeof order === 'number' ? order : pluginCtx.systemPrompt.getSectionOrder(order),
              text,
            })
          }
          // Stand-ins for the composition's first-party sections, at the real orders.
          section('plan:policy', 'PLAN_POLICY', 'plan sentinel')
          section('tool:bash', 'TOOL_BASH', 'bash sentinel')
          section('tool:subagent', 'TOOL_SUBAGENT', 'subagent sentinel')
          section('tool:computer-use', 'TOOL_COMPUTER_USE', 'computer sentinel')
          section('mcp:servers', 'MCP_SERVERS', 'mcp sentinel')
          section('tool-groups:menu', TOOL_GROUPS_MENU_ORDER, 'menu sentinel')

          for (const seat of ['orchestrator', 'sysadmin'] as const) {
            const persona = personaOf(seat)
            const scope = createScope(pluginCtx, keys[seat])
            scopes.push(scope)
            scope.ctx.systemPrompt.section({
              name: PERSONA_PREFIX_SECTION,
              order: scope.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
              text: persona.prefix,
            })
            scope.ctx.systemPrompt.section({
              name: PERSONA_SUFFIX_SECTION,
              order: scope.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
              text: persona.suffix ?? '',
            })
          }
        },
      } as never)

      const orchestratorAssembly = await ctx.systemPrompt.assemble({ scope: keys.orchestrator })
      const sysadminAssembly = await ctx.systemPrompt.assemble({ scope: keys.sysadmin })
      expect(orchestratorAssembly.sections.at(-1)?.name).toBe(PERSONA_SUFFIX_SECTION)
      expect(sysadminAssembly.sections.at(-1)?.name).toBe(PERSONA_SUFFIX_SECTION)

      const orchestratorPersona = personaOf('orchestrator')
      const sysadminPersona = personaOf('sysadmin')
      const orchestratorPrompt = renderPrompt(orchestratorAssembly)
      const sysadminPrompt = renderPrompt(sysadminAssembly)
      expect(orchestratorPrompt.endsWith(orchestratorPersona.suffix ?? '')).toBe(true)
      expect(sysadminPrompt.endsWith(sysadminPersona.suffix ?? '')).toBe(true)

      const sharedPrefix = orchestratorPrompt.slice(0, orchestratorPrompt.length - (orchestratorPersona.suffix ?? '').length)
      const sysadminPrefix = sysadminPrompt.slice(0, sysadminPrompt.length - (sysadminPersona.suffix ?? '').length)
      expect(sysadminPrefix).toBe(sharedPrefix)
      expect(sharedPrefix).toContain(orchestratorPersona.prefix)
      expect(sharedPrefix).toContain('menu sentinel')
      expect(sharedPrefix).not.toContain('Master Orchestrator')
      expect(sharedPrefix).not.toContain('You are Sysadmin')
    } finally {
      for (const scope of scopes) await scope.dispose()
      await ctx.fiber.dispose()
    }
  })
})
