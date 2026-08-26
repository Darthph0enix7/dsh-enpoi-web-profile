/**
 * enpoi-council — Cordis plugin entry point.
 *
 * Exposes `roundtable` (Colosseum Dialectic debate) and `chorus` (Polyphonic brainstorm)
 * tools to the orchestrator and sysadmin agent presets.
 *
 * @module dsh-enpoi-council
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerCouncilTools } from './tools'

export const name = 'enpoi-council'
export const inject = ['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents']

export function apply(ctx: Context): void {
  ctx.inject(['tools', 'subagents', 'sessionPersistence', 'sessions', 'agents'], (injected) => {
    registerCouncilTools(injected, ctx)
  })
}
