/**
 * enpoi-council — Cordis plugin entry point.
 *
 * Exposes `roundtable` (debate council) and `chorus` (ideation council) on the
 * doc-54 core engine: blind formulation, dispute ledger, referee adjudication,
 * evidence broker, state-delta stopping, chair synthesis.
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { registerCouncilTools } from './tools.ts'

export const name = 'enpoi-council'
export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

const PersonaModelSchema = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
  reasoningEffort: Schema.string(),
})

const OrchestrationSettingsSchema = Schema.object({
  personas: Schema.dict(PersonaModelSchema).default({}),
  uiPreferences: Schema.object({
    hiddenModels: Schema.any(),
    favorites: Schema.any(),
    providerOrder: Schema.any(),
    defaultModel: Schema.any(),
  }).default({}),
})

export function apply(ctx: Context): void {
  ctx.inject(['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents'], (injected) => {
    registerCouncilTools(injected, ctx)
  })
}
