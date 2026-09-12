/**
 * enpoi-council — Cordis plugin entry point.
 *
 * Exposes `roundtable` (Colosseum Dialectic debate) and `chorus` (Polyphonic brainstorm)
 * tools to the orchestrator and sysadmin agent presets, and registers the
 * `enpoi-orchestration` settings namespace for persistent per-persona model routing.
 *
 * @module dsh-enpoi-council
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { registerCouncilTools } from './tools'

export const name = 'enpoi-council'
export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

const ORCH_NS = 'enpoi-orchestration'

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
  // Register the orchestration settings namespace so persona assignments persist & hot-publish
  ctx.inject(['settings'], (scope) => {
    const settings = scope.get('settings') as { register?: (ns: unknown, schema: unknown) => void } | undefined
    try {
      settings?.register?.(ORCH_NS, OrchestrationSettingsSchema)
    } catch {}
  })

  ctx.inject(['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents'], (injected) => {
    registerCouncilTools(injected, ctx)
  })
}
