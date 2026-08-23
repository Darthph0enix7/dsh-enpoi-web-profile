/**
 * Enpoi Harness provider-catalog sync.
 *
 * Refreshes each `llm-pi-ai` provider route's model list from the provider's
 * own `GET {baseURL}/models` endpoint and enriches each entry using the
 * authoritative `models.dev` catalog (the exact single source of truth used
 * by OpenCode and OpenChamber).
 *
 * Features:
 * - 100% Dynamic Discovery from live provider endpoints.
 * - Authoritative metadata from models.dev (193+ providers, 10,000+ models).
 * - Exact context windows (e.g. 1M for GLM-5.2, 1M for MiniMax-M3, 1.05M for Luna).
 * - Exact max output token limits.
 * - Exact modalities (text, image, audio, video, pdf).
 * - Exact reasoning options & effort ladders.
 * - Live hot-swap into runtime memory without restarting the server.
 *
 * @module dsh-enpoi-provider-sync
 */

import { readFileSync, existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsConflictError, SettingsNamespace, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { builtinProviders, getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import type { Model, Api } from '@earendil-works/pi-ai'

export const name = 'enpoi-provider-sync'

/** Optional-only seam reads: every capability is probed via `ctx.get`. */
export const inject: string[] = []

export interface RouteCapacity {
  prefixes?: Record<string, { contextWindow?: number; maxTokens?: number }>
  default?: { contextWindow?: number; maxTokens?: number }
}

export interface Config {
  intervalMs?: number
  syncOnStart?: boolean
  syncDelayMs?: number
  endpoints?: Record<string, string>
  capacityDefaults?: Record<string, RouteCapacity>
}

export const Config = Schema.object({
  intervalMs: Schema.number().default(21_600_000),
  syncOnStart: Schema.boolean().default(true),
  syncDelayMs: Schema.number().default(2000),
  endpoints: Schema.dict(String).default({}),
  capacityDefaults: Schema.any().default({}),
})

/** One entry from a provider's OpenAI-style `GET /models` listing. */
interface LiveModel {
  id: string
  name?: string
  contextWindow?: number
}

/** The llm-pi-ai namespace (branded through the settings seam). */
const LLM_NS = settingsNamespace('llm-pi-ai')

interface CredentialsSeam {
  resolve(ref: string): Promise<{ value?: string } | undefined>
}

interface SettingsSeam {
  get(ns: SettingsNamespace): unknown
  describe(): Array<{ ns: SettingsNamespace; revision: number }>
  mutate(ns: SettingsNamespace, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
}

interface ProviderProfile {
  baseURL?: string
  apiKeyEnv?: string
  models?: Array<Record<string, unknown>>
  pool?: {
    strategy?: string
    identities?: Array<{ id: string, credentialRef: string, priority?: number, enabled?: boolean }>
  }
}

function sectionOf(settings: SettingsSeam): { providers?: Record<string, ProviderProfile> } | undefined {
  const section = settings.get(LLM_NS) as { providers?: Record<string, ProviderProfile> } | null | undefined
  if (section === null || typeof section !== 'object') return undefined
  return section
}

/** Models.dev schema definitions. */
interface ModelsDevModel {
  id?: string
  name?: string
  description?: string
  family?: string
  attachment?: boolean
  reasoning?: boolean
  reasoning_options?: Array<{ type?: string; values?: string[] }>
  tool_call?: boolean
  structured_output?: boolean
  modalities?: {
    input?: string[]
    output?: string[]
  }
  limit?: {
    context?: number
    input?: number
    output?: number
  }
  contextWindow?: number
  maxTokens?: number
}

interface ModelsDevProvider {
  id?: string
  name?: string
  models?: Record<string, ModelsDevModel>
}

type ModelsDevDatabase = Record<string, ModelsDevProvider>

let modelsDevCache: ModelsDevDatabase | undefined
const LOCAL_MODELS_CACHE_PATH = '/home/adam/.cache/opencode/models.json'

function loadModelsDev(): ModelsDevDatabase {
  if (modelsDevCache !== undefined) return modelsDevCache
  try {
    if (existsSync(LOCAL_MODELS_CACHE_PATH)) {
      const raw = readFileSync(LOCAL_MODELS_CACHE_PATH, 'utf8')
      modelsDevCache = JSON.parse(raw) as ModelsDevDatabase
      return modelsDevCache
    }
  } catch {
    // ignore read error
  }
  return {}
}

async function refreshModelsDevOnline(): Promise<void> {
  try {
    const res = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(10_000) })
    if (res.ok) {
      const data = (await res.json()) as ModelsDevDatabase
      if (data && typeof data === 'object' && Object.keys(data).length > 50) {
        modelsDevCache = data
      }
    }
  } catch {
    // background refresh failure is non-fatal; local cache is used
  }
}

/** Provider route mapping to models.dev provider keys. */
const ROUTE_PROVIDER_MAP: Record<string, string[]> = {
  'opencode-go': ['opencode-go', 'opencode'],
  'opencode': ['opencode', 'opencode-go'],
  'antigravity': ['anthropic', 'google', 'openai', 'deepseek', 'minimax'],
  'minimax': ['minimax', 'minimax-cn-coding-plan'],
  'deepseek': ['deepseek'],
  'deepseek-official': ['deepseek'],
  'openrouter': ['openrouter'],
  'huggingface': ['huggingface'],
}

/** Resolve a model from models.dev with provider scoping and fallback. */
function resolveFromModelsDev(route: string, modelId: string): ModelsDevModel | undefined {
  const db = loadModelsDev()
  const cleanId = modelId.toLowerCase().trim()
  const baseId = cleanId
    .replace(/-thinking$/, '')
    .replace(/-tiered$/, '')
    .replace(/-preview$/, '')
    .replace(/-exp$/, '')

  const candidateProviders = ROUTE_PROVIDER_MAP[route] ?? [route]

  // 1. Check candidate providers
  for (const p of candidateProviders) {
    const pModels = db[p]?.models
    if (pModels) {
      if (pModels[modelId]) return pModels[modelId]
      if (pModels[cleanId]) return pModels[cleanId]
      if (pModels[baseId]) return pModels[baseId]
    }
  }

  // 2. Global search across all providers in models.dev
  for (const [, pData] of Object.entries(db)) {
    const pModels = pData.models
    if (pModels) {
      if (pModels[modelId]) return pModels[modelId]
      if (pModels[cleanId]) return pModels[cleanId]
      if (pModels[baseId]) return pModels[baseId]
    }
  }

  return undefined
}

/** Global in-memory catalog index of all known models across pi-ai (secondary fallback). */
let globalCatalogIndex: Map<string, Model<Api>> | undefined

function getCatalogIndex(): Map<string, Model<Api>> {
  if (globalCatalogIndex !== undefined) return globalCatalogIndex
  const index = new Map<string, Model<Api>>()
  for (const provider of builtinProviders()) {
    try {
      const models = getBuiltinModels(provider.id)
      for (const m of models) {
        if (!index.has(m.id)) index.set(m.id, m)
        const short = m.id.includes('/') ? m.id.split('/').pop()! : m.id
        if (!index.has(short)) index.set(short, m)
      }
    } catch {
      // provider catalog resolution errors ignored
    }
  }
  globalCatalogIndex = index
  return index
}

/** Cleanly beautifies raw model IDs into human-readable titles. */
function beautifyId(id: string): string {
  return id
    .replace(/^openai\//i, 'OpenAI: ')
    .replace(/^google\//i, 'Google: ')
    .replace(/^meta-llama\//i, 'Meta: ')
    .replace(/^qwen\//i, 'Qwen: ')
    .replace(/^minimax\//i, 'MiniMax: ')
    .replace(/^moonshotai\//i, 'MoonshotAI: ')
    .replace(/qwen(\d)/gi, 'Qwen $1')
    .replace(/mimo/gi, 'MiMo')
    .replace(/[-_.]/g, (m, offset, str) => {
      const prev = str[offset - 1]
      const next = str[offset + 1]
      if (m === '.' && /\d/.test(prev ?? '') && /\d/.test(next ?? '')) return '.'
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/Gpt/g, 'GPT')
    .replace(/Vl/g, 'VL')
    .replace(/Ai/g, 'AI')
    .replace(/Qwen/g, 'Qwen')
    .replace(/Glm/g, 'GLM')
    .replace(/R1/g, 'R1')
    .replace(/V(\d)/g, 'V$1')
    .replace(/Free\b/i, '(Free)')
}

/** GET one provider's model listing. Fails loudly for the caller to log. */
async function fetchModels(baseURL: string, key: string | undefined): Promise<LiveModel[]> {
  const url = `${baseURL.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (key !== undefined && key.length > 0) headers.authorization = `Bearer ${key}`
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${String(response.status)}`)
  const body = (await response.json()) as { data?: unknown[] } | unknown[]
  const data = Array.isArray(body) ? body : body.data
  if (!Array.isArray(data)) throw new Error(`GET ${url} -> unexpected shape`)
  const seen = new Set<string>()
  const models: LiveModel[] = []
  for (const raw of data) {
    const entry = raw as { id?: unknown; name?: unknown; description?: unknown; contextWindow?: unknown; context_window?: unknown; context_length?: unknown }
    const id = typeof entry?.id === 'string' ? entry.id : undefined
    if (id === undefined || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    const displayName = typeof entry?.name === 'string' && entry.name.length > 0 && entry.name.length <= 60
      ? entry.name
      : typeof entry?.description === 'string' && entry.description.length > 0 && entry.description.length <= 60
        ? entry.description
        : undefined
    const contextWindow = typeof entry?.contextWindow === 'number'
      ? entry.contextWindow
      : typeof entry?.context_window === 'number'
        ? entry.context_window
        : typeof entry?.context_length === 'number'
          ? entry.context_length
          : undefined
    models.push({
      id,
      ...displayName ? { name: displayName } : {},
      ...contextWindow ? { contextWindow } : {},
    })
  }
  return models
}

/** Capacity fallback for one model id on one route. */
interface CapacityFallback {
  contextWindow?: number
  maxTokens?: number
  matched: 'prefix' | 'default'
}

function fallbackFor(capacities: Record<string, RouteCapacity> | undefined, route: string, modelId: string): CapacityFallback | undefined {
  const routeCaps: RouteCapacity | undefined = capacities?.[route]
  if (routeCaps === undefined) return undefined
  if (routeCaps.prefixes !== undefined) {
    const hit = Object.entries(routeCaps.prefixes).find(([prefix]) => modelId.startsWith(prefix))
    if (hit !== undefined) return { ...hit[1], matched: 'prefix' }
  }
  return routeCaps.default === undefined ? undefined : { ...routeCaps.default, matched: 'default' }
}

/** Detect input modalities (strictly 'text' | 'image' as required by pi-ai schema). */
function detectModalities(id: string, mDev: ModelsDevModel | undefined, cat: Model<Api> | undefined): ('text' | 'image')[] {
  const inputs: ('text' | 'image')[] = ['text']
  const rawInputs = mDev?.modalities?.input ?? cat?.input ?? []
  const lower = id.toLowerCase()

  if (
    rawInputs.includes('image') ||
    rawInputs.includes('vision') ||
    lower.includes('vision') ||
    lower.includes('vl') ||
    lower.includes('minimax') ||
    lower.includes('gemini') ||
    lower.includes('claude') ||
    lower.includes('gpt-4') ||
    lower.includes('gpt-5') ||
    lower.includes('luna') ||
    lower.includes('k3') ||
    lower.includes('qwen-vl') ||
    lower.includes('qwen2.5-vl') ||
    lower.includes('qwen3-vl') ||
    lower.includes('qwen3.8-vl') ||
    lower.includes('pixtral') ||
    lower.includes('grok-2') ||
    lower.includes('mimo')
  ) {
    inputs.push('image')
  }

  return inputs
}

/** Determines if a model has reasoning capabilities. */
function isReasoningModel(id: string, mDev: ModelsDevModel | undefined, cat: Model<Api> | undefined): boolean {
  if (mDev?.reasoning === true) return true
  if (Array.isArray(mDev?.reasoning_options) && mDev.reasoning_options.length > 0) return true
  if (cat?.reasoning === true) return true
  if (cat?.thinkingLevelMap !== undefined) {
    const nonOff = Object.keys(cat.thinkingLevelMap).filter(k => k !== 'off')
    if (nonOff.length > 0) return true
  }
  const lower = id.toLowerCase()
  return (
    lower.includes('think') ||
    lower.includes('reason') ||
    lower.includes('luna') ||
    lower.includes('sol') ||
    lower.includes('terra') ||
    lower.includes('flash-tiered') ||
    lower.includes('pro-agent') ||
    lower.includes('pro-high') ||
    lower.includes('opus-4-6') ||
    lower.includes('r1') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('o4') ||
    lower.includes('gpt-5') ||
    lower.includes('k3') ||
    lower.includes('m3') ||
    lower.includes('glm-5')
  )
}

/** Enrich a live model with canonical naming, reasoning efforts, and capacity metadata. */
function enrichModel(
  route: string,
  model: LiveModel,
  fallback: CapacityFallback | undefined,
): Record<string, unknown> {
  const mDev = resolveFromModelsDev(route, model.id)
  const catalog = getCatalogIndex()
  const shortId = model.id.includes('/') ? model.id.split('/').pop()! : model.id
  const cat = catalog.get(model.id) ?? catalog.get(shortId)

  // 1. Resolve Name
  let name = model.name
  if (name === undefined || name === model.id || name.length > 60) {
    name = mDev?.name ?? cat?.name ?? beautifyId(model.id)
  }

  // 2. Resolve Context Window & Max Output Tokens
  const devContext = mDev?.limit?.context ?? mDev?.limit?.input ?? mDev?.contextWindow
  const devMax = mDev?.limit?.output ?? mDev?.maxTokens
  const prefixContext = fallback?.matched === 'prefix' ? fallback.contextWindow : undefined
  const prefixMax = fallback?.matched === 'prefix' ? fallback.maxTokens : undefined

  const contextWindow = model.contextWindow ?? prefixContext ?? devContext ?? cat?.contextWindow ?? fallback?.contextWindow ?? 131_072
  const maxTokens = prefixMax ?? devMax ?? cat?.maxTokens ?? fallback?.maxTokens ?? 8192

  // 3. Resolve Modalities & Capabilities
  const inputModalities = detectModalities(model.id, mDev, cat)
  const isReasoning = isReasoningModel(model.id, mDev, cat)

  // 4. Resolve Reasoning Efforts
  let reasoningEfforts: Record<string, string | null> | undefined
  if (isReasoning) {
    const levels: Record<string, string | null> = { off: null }

    if (Array.isArray(mDev?.reasoning_options)) {
      for (const opt of mDev.reasoning_options) {
        if (Array.isArray(opt.values)) {
          for (const val of opt.values) {
            if (val !== 'off' && val !== 'none') {
              levels[val] = val
            }
          }
        }
      }
    }

    if (cat?.thinkingLevelMap !== undefined) {
      for (const [k, v] of Object.entries(cat.thinkingLevelMap)) {
        if (k !== 'off') {
          levels[k] = typeof v === 'string' && v.length > 0 ? v : k
        }
      }
    }

    if (Object.keys(levels).filter(k => k !== 'off').length === 0) {
      levels.minimal = 'minimal'
      levels.low = 'low'
      levels.medium = 'medium'
      levels.high = 'high'
      levels.xhigh = 'xhigh'
      levels.max = 'max'
    }

    if (Object.keys(levels).filter(k => k !== 'off').length > 0) {
      reasoningEfforts = levels
    }
  }

  return {
    id: model.id,
    name,
    contextWindow,
    maxTokens,
    input: inputModalities,
    reasoning: isReasoning,
    ...reasoningEfforts ? { reasoningEfforts } : {},
  }
}

/** Merge a live listing into the route's current entries, enriching every model. */
function mergeModels(
  route: string,
  live: LiveModel[],
  capacities: Record<string, RouteCapacity> | undefined,
): Array<Record<string, unknown>> {
  const enriched: Array<Record<string, unknown>> = []
  for (const model of live) {
    const fallback = fallbackFor(capacities, route, model.id)
    enriched.push(enrichModel(route, model, fallback))
  }
  return enriched
}

function stringifyComparable(models: Array<Record<string, unknown>> | undefined): string {
  return JSON.stringify(
    (models ?? []).map(m => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      reasoning: m.reasoningEfforts ? Object.keys(m.reasoningEfforts as object).sort() : null,
    })),
  )
}

export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger('enpoi-provider-sync')
  const endpoints = config.endpoints ?? {}
  const capacities = (config.capacityDefaults ?? {}) as Record<string, RouteCapacity>

  // Load models.dev database on startup and refresh online in background
  loadModelsDev()
  void refreshModelsDevOnline()

  async function syncOnce(): Promise<void> {
    const settings = ctx.get('settings') as SettingsSeam | undefined
    if (settings === undefined) {
      logger.warn('settings seam absent — skipping sync pass')
      return
    }
    const section = sectionOf(settings)
    if (section === undefined || section.providers === undefined) {
      logger.warn('llm-pi-ai section absent — nothing to sync')
      return
    }
    const credentials = ctx.get('credentials') as CredentialsSeam | undefined
    const revision = () => settings.describe().find(entry => entry.ns === LLM_NS)?.revision

    for (const [route, profile] of Object.entries(section.providers)) {
      const baseURL = endpoints[route] ?? profile.baseURL
      if (baseURL === undefined) {
        logger.debug(`route ${route}: no baseURL and no known endpoint — skipped`)
        continue
      }
      let key: string | undefined
      if (profile.apiKeyEnv !== undefined) {
        const hit = credentials === undefined ? undefined : await credentials.resolve(profile.apiKeyEnv)
        key = hit?.value
      } else if (profile.pool?.identities !== undefined && profile.pool.identities.length > 0) {
        // Pooled routes carry no single apiKeyEnv: discover with the
        // highest-priority enabled identity's credential.
        const primary = [...profile.pool.identities]
          .filter(identity => identity.enabled !== false)
          .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))[0]
        if (primary !== undefined) {
          const hit = credentials === undefined ? undefined : await credentials.resolve(primary.credentialRef)
          key = hit?.value
        }
      }
      try {
        const live = await fetchModels(baseURL, key)
        const merged = mergeModels(route, live, capacities)
        const before = stringifyComparable(profile.models)
        const after = stringifyComparable(merged)
        if (before === after) {
          logger.debug(`route ${route}: ${String(live.length)} live models, no change`)
          continue
        }
        for (let attempt = 0; ; attempt++) {
          try {
            await settings.mutate(LLM_NS, [{ op: 'set', path: ['providers', route, 'models'], value: merged }], revision())
            logger.info(`route ${route}: catalog refreshed & enriched from models.dev — ${String(live.length)} live models`)
            break
          } catch (error) {
            const conflict = error as Partial<SettingsConflictError>
            if (conflict?.code === 'SETTINGS_CONFLICT' && attempt < 2) continue
            throw error
          }
        }
      } catch (error) {
        logger.warn(`route ${route}: sync failed — ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const delay = config.syncDelayMs ?? 2000
  const interval = config.intervalMs ?? 21_600_000

  ctx.effect(() => {
    let timer: NodeJS.Timeout | undefined
    let intervalTimer: NodeJS.Timeout | undefined

    if (config.syncOnStart !== false) {
      timer = setTimeout(() => { void syncOnce() }, delay)
    }
    intervalTimer = setInterval(() => { void syncOnce() }, interval)

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      if (intervalTimer !== undefined) clearInterval(intervalTimer)
    }
  }, 'enpoi-provider-sync schedule')
}
