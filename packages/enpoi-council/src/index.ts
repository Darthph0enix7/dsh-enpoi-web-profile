/**
 * enpoi-council — Cordis plugin entry point.
 *
 * Exposes `roundtable` (debate council) and `chorus` (ideation council) on the
 * doc-54 core engine: blind formulation, dispute ledger, referee adjudication,
 * evidence broker, state-delta stopping, chair synthesis.
 *
 * Settings-defined councils (`enpoi-orchestration.councils`) extend that set at
 * runtime: each enabled council registers its own `<councilId>` tool, the two
 * management tools (`council_register` / `council_list`) manage the registry,
 * and the `enpoiCouncil` Typert Remote namespace (`remote.ts`) feeds the UI.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { mountEnpoiCouncilRemote } from './remote.ts'
import { registerCouncilTools } from './tools.ts'

export const name = 'enpoi-council'
export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

const PersonaModelSchema = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
  reasoningEffort: Schema.string(),
})

/**
 * Declared shape of the shared `enpoi-orchestration` namespace as this plugin
 * consumes it. The namespace itself is registered by enpoi-capabilities;
 * `councils` carries the declarative council registry (declarative specs plus
 * the `disabled` retire switch).
 */
const OrchestrationSettingsSchema = Schema.object({
  personas: Schema.dict(PersonaModelSchema).default({}),
  councils: Schema.dict(Schema.any()).default({}),
  uiPreferences: Schema.object({
    hiddenModels: Schema.any(),
    favorites: Schema.any(),
    providerOrder: Schema.any(),
    defaultModel: Schema.any(),
  }).default({}),
})

export function apply(ctx: Context): void {
  mountEnpoiCouncilRemote(ctx)
  ctx.inject(['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents'], (injected) => {
    registerCouncilTools(injected, ctx)
  })
}
