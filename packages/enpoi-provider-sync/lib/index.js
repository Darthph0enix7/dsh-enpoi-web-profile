// packages/enpoi-provider-sync/src/index.ts
import { readFileSync, existsSync } from "node:fs";
import Schema from "schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { builtinProviders, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
var name = "enpoi-provider-sync";
var inject = [];
var Config = Schema.object({
  intervalMs: Schema.number().default(216e5),
  syncOnStart: Schema.boolean().default(true),
  syncDelayMs: Schema.number().default(2e3),
  endpoints: Schema.dict(String).default({}),
  capacityDefaults: Schema.any().default({})
});
var LLM_NS = settingsNamespace("llm-pi-ai");
function sectionOf(settings) {
  const section = settings.get(LLM_NS);
  if (section === null || typeof section !== "object") return void 0;
  return section;
}
var modelsDevCache;
var LOCAL_MODELS_CACHE_PATH = "/home/adam/.cache/opencode/models.json";
function loadModelsDev() {
  if (modelsDevCache !== void 0) return modelsDevCache;
  try {
    if (existsSync(LOCAL_MODELS_CACHE_PATH)) {
      const raw = readFileSync(LOCAL_MODELS_CACHE_PATH, "utf8");
      modelsDevCache = JSON.parse(raw);
      return modelsDevCache;
    }
  } catch {
  }
  return {};
}
async function refreshModelsDevOnline() {
  try {
    const res = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(1e4) });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object" && Object.keys(data).length > 50) {
        modelsDevCache = data;
      }
    }
  } catch {
  }
}
var ROUTE_PROVIDER_MAP = {
  "opencode-go": ["opencode-go", "opencode"],
  "opencode": ["opencode", "opencode-go"],
  "antigravity": ["anthropic", "google", "openai", "deepseek", "minimax"],
  "minimax": ["minimax", "minimax-cn-coding-plan"],
  "deepseek": ["deepseek"],
  "deepseek-official": ["deepseek"],
  "openrouter": ["openrouter"],
  "huggingface": ["huggingface"]
};
function resolveFromModelsDev(route, modelId) {
  const db = loadModelsDev();
  const cleanId = modelId.toLowerCase().trim();
  const SUFFIXES = ["-thinking", "-tiered", "-preview", "-exp", "-high", "-low", "-medium", "-agent", "-latest", "-image"];
  const candidates = [cleanId];
  let base = cleanId;
  for (const suffix of SUFFIXES) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      candidates.push(base);
    }
  }
  const candidateProviders = ROUTE_PROVIDER_MAP[route] ?? [route];
  const find = (pModels) => {
    if (!pModels) return void 0;
    for (const c of candidates) {
      const hit = pModels[c];
      if (hit) return hit;
    }
    const prefix = base;
    if (prefix.length >= 8) {
      const matches = Object.keys(pModels).filter((k) => k.startsWith(`${prefix}-`));
      if (matches.length > 0) {
        matches.sort((a, b) => a.length - b.length);
        return pModels[matches[0]];
      }
    }
    return void 0;
  };
  for (const p of candidateProviders) {
    const hit = find(db[p]?.models);
    if (hit) return hit;
  }
  for (const [, pData] of Object.entries(db)) {
    const hit = find(pData.models);
    if (hit) return hit;
  }
  return void 0;
}
var globalCatalogIndex;
function getCatalogIndex() {
  if (globalCatalogIndex !== void 0) return globalCatalogIndex;
  const index = /* @__PURE__ */ new Map();
  for (const provider of builtinProviders()) {
    try {
      const models = getBuiltinModels(provider.id);
      for (const m of models) {
        if (!index.has(m.id)) index.set(m.id, m);
        const short = m.id.includes("/") ? m.id.split("/").pop() : m.id;
        if (!index.has(short)) index.set(short, m);
      }
    } catch {
    }
  }
  globalCatalogIndex = index;
  return index;
}
function beautifyId(id) {
  return id.replace(/^openai\//i, "OpenAI: ").replace(/^google\//i, "Google: ").replace(/^meta-llama\//i, "Meta: ").replace(/^qwen\//i, "Qwen: ").replace(/^minimax\//i, "MiniMax: ").replace(/^moonshotai\//i, "MoonshotAI: ").replace(/qwen(\d)/gi, "Qwen $1").replace(/mimo/gi, "MiMo").replace(/[-_.]/g, (m, offset, str) => {
    const prev = str[offset - 1];
    const next = str[offset + 1];
    if (m === "." && /\d/.test(prev ?? "") && /\d/.test(next ?? "")) return ".";
    return " ";
  }).replace(/\s+/g, " ").trim().replace(/\b([a-z])/g, (_, c) => c.toUpperCase()).replace(/Gpt/g, "GPT").replace(/Vl/g, "VL").replace(/Ai/g, "AI").replace(/Qwen/g, "Qwen").replace(/Glm/g, "GLM").replace(/R1/g, "R1").replace(/V(\d)/g, "V$1").replace(/Free\b/i, "(Free)");
}
async function fetchModels(baseURL, key) {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const headers = { accept: "application/json" };
  if (key !== void 0 && key.length > 0) headers.authorization = `Bearer ${key}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15e3) });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${String(response.status)}`);
  const body = await response.json();
  const data = Array.isArray(body) ? body : body.data;
  if (!Array.isArray(data)) throw new Error(`GET ${url} -> unexpected shape`);
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const raw of data) {
    const entry = raw;
    const id = typeof entry?.id === "string" ? entry.id : void 0;
    if (id === void 0 || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const displayName = typeof entry?.name === "string" && entry.name.length > 0 && entry.name.length <= 60 ? entry.name : typeof entry?.description === "string" && entry.description.length > 0 && entry.description.length <= 60 ? entry.description : void 0;
    const contextWindow = typeof entry?.contextWindow === "number" ? entry.contextWindow : typeof entry?.context_window === "number" ? entry.context_window : typeof entry?.context_length === "number" ? entry.context_length : void 0;
    models.push({
      id,
      ...displayName ? { name: displayName } : {},
      ...contextWindow ? { contextWindow } : {}
    });
  }
  return models;
}
function fallbackFor(capacities, route, modelId) {
  const routeCaps = capacities?.[route];
  if (routeCaps === void 0) return void 0;
  if (routeCaps.prefixes !== void 0) {
    const hit = Object.entries(routeCaps.prefixes).find(([prefix]) => modelId.startsWith(prefix));
    if (hit !== void 0) return { ...hit[1], matched: "prefix" };
  }
  return routeCaps.default === void 0 ? void 0 : { ...routeCaps.default, matched: "default" };
}
function detectModalities(id, mDev, cat) {
  const rawInputs = mDev?.modalities?.input ?? cat?.input ?? [];
  const lower = id.toLowerCase();
  if (rawInputs.length > 0) {
    const inputs = ["text"];
    if (rawInputs.includes("image") || rawInputs.includes("vision")) inputs.push("image");
    return inputs;
  }
  if (lower.includes("vision") || lower.includes("vl") || lower.includes("minimax") || lower.includes("gemini") || lower.includes("claude") || lower.includes("gpt-4") || lower.includes("gpt-5") || lower.includes("luna") || lower.includes("k3") || lower.includes("qwen-vl") || lower.includes("qwen2.5-vl") || lower.includes("qwen3-vl") || lower.includes("qwen3.8-vl") || lower.includes("pixtral") || lower.includes("grok-2") || lower.includes("mimo")) {
    return ["text", "image"];
  }
  return ["text"];
}
function isReasoningModel(id, mDev, cat) {
  if (mDev?.reasoning === true) return true;
  if (Array.isArray(mDev?.reasoning_options) && mDev.reasoning_options.length > 0) return true;
  if (cat?.reasoning === true) return true;
  if (cat?.thinkingLevelMap !== void 0) {
    const nonOff = Object.keys(cat.thinkingLevelMap).filter((k) => k !== "off");
    if (nonOff.length > 0) return true;
  }
  const lower = id.toLowerCase();
  return lower.includes("think") || lower.includes("reason") || lower.includes("luna") || lower.includes("sol") || lower.includes("terra") || lower.includes("flash-tiered") || lower.includes("pro-agent") || lower.includes("pro-high") || lower.includes("opus-4-6") || lower.includes("r1") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4") || lower.includes("gpt-5") || lower.includes("k3") || lower.includes("m3") || lower.includes("glm-5");
}
function enrichModel(route, model, fallback) {
  const mDev = resolveFromModelsDev(route, model.id);
  const catalog = getCatalogIndex();
  const shortId = model.id.includes("/") ? model.id.split("/").pop() : model.id;
  const cat = catalog.get(model.id) ?? catalog.get(shortId);
  let name2 = mDev?.name;
  if (name2 === void 0 || name2.length === 0) {
    const liveName = model.name;
    if (liveName !== void 0 && liveName !== model.id && liveName.length <= 60) {
      name2 = liveName;
    } else {
      name2 = cat?.name ?? beautifyId(model.id);
    }
  }
  const devContext = mDev?.limit?.context ?? mDev?.limit?.input ?? mDev?.contextWindow;
  const devMax = mDev?.limit?.output ?? mDev?.maxTokens;
  const prefixContext = fallback?.matched === "prefix" ? fallback.contextWindow : void 0;
  const prefixMax = fallback?.matched === "prefix" ? fallback.maxTokens : void 0;
  const contextWindow = model.contextWindow ?? prefixContext ?? devContext ?? cat?.contextWindow ?? fallback?.contextWindow ?? 262144;
  const maxTokens = prefixMax ?? devMax ?? cat?.maxTokens ?? fallback?.maxTokens ?? 32768;
  const inputModalities = detectModalities(model.id, mDev, cat);
  const isReasoning = isReasoningModel(model.id, mDev, cat);
  let reasoningEfforts;
  if (isReasoning) {
    const levels = { off: null };
    if (Array.isArray(mDev?.reasoning_options)) {
      for (const opt of mDev.reasoning_options) {
        if (Array.isArray(opt.values)) {
          for (const val of opt.values) {
            if (val !== "off" && val !== "none") {
              levels[val] = val;
            }
          }
        }
      }
    }
    if (cat?.thinkingLevelMap !== void 0) {
      for (const [k, v] of Object.entries(cat.thinkingLevelMap)) {
        if (k !== "off") {
          levels[k] = typeof v === "string" && v.length > 0 ? v : k;
        }
      }
    }
    if (Object.keys(levels).filter((k) => k !== "off").length === 0) {
      levels.minimal = "minimal";
      levels.low = "low";
      levels.medium = "medium";
      levels.high = "high";
      levels.xhigh = "xhigh";
      levels.max = "max";
    }
    if (Object.keys(levels).filter((k) => k !== "off").length > 0) {
      reasoningEfforts = levels;
    }
  }
  return {
    id: model.id,
    name: name2,
    contextWindow,
    maxTokens,
    input: inputModalities,
    reasoning: isReasoning,
    ...reasoningEfforts ? { reasoningEfforts } : {}
  };
}
function mergeModels(route, live, capacities) {
  const enriched = [];
  for (const model of live) {
    const fallback = fallbackFor(capacities, route, model.id);
    enriched.push(enrichModel(route, model, fallback));
  }
  return enriched;
}
function stringifyComparable(models) {
  return JSON.stringify(
    (models ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      reasoning: m.reasoningEfforts ? Object.keys(m.reasoningEfforts).sort() : null
    }))
  );
}
function apply(ctx, config) {
  const logger = ctx.logger("enpoi-provider-sync");
  const endpoints = config.endpoints ?? {};
  const capacities = config.capacityDefaults ?? {};
  loadModelsDev();
  void refreshModelsDevOnline();
  async function syncOnce() {
    const settings = ctx.get("settings");
    if (settings === void 0) {
      logger.warn("settings seam absent \u2014 skipping sync pass");
      return;
    }
    const section = sectionOf(settings);
    if (section === void 0 || section.providers === void 0) {
      logger.warn("llm-pi-ai section absent \u2014 nothing to sync");
      return;
    }
    const credentials = ctx.get("credentials");
    const revision = () => settings.describe().find((entry) => entry.ns === LLM_NS)?.revision;
    for (const [route, profile] of Object.entries(section.providers)) {
      const baseURL = endpoints[route] ?? profile.baseURL;
      if (baseURL === void 0) {
        logger.debug(`route ${route}: no baseURL and no known endpoint \u2014 skipped`);
        continue;
      }
      let key;
      if (profile.apiKeyEnv !== void 0) {
        const hit = credentials === void 0 ? void 0 : await credentials.resolve(profile.apiKeyEnv);
        key = hit?.value;
      } else if (profile.pool?.identities !== void 0 && profile.pool.identities.length > 0) {
        const primary = [...profile.pool.identities].filter((identity) => identity.enabled !== false).sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))[0];
        if (primary !== void 0) {
          const hit = credentials === void 0 ? void 0 : await credentials.resolve(primary.credentialRef);
          key = hit?.value;
        }
      }
      try {
        const live = await fetchModels(baseURL, key);
        const merged = mergeModels(route, live, capacities);
        const before = stringifyComparable(profile.models);
        const after = stringifyComparable(merged);
        if (before === after) {
          logger.debug(`route ${route}: ${String(live.length)} live models, no change`);
          continue;
        }
        for (let attempt = 0; ; attempt++) {
          try {
            await settings.mutate(LLM_NS, [{ op: "set", path: ["providers", route, "models"], value: merged }], revision());
            logger.info(`route ${route}: catalog refreshed & enriched from models.dev \u2014 ${String(live.length)} live models`);
            break;
          } catch (error) {
            const conflict = error;
            if (conflict?.code === "SETTINGS_CONFLICT" && attempt < 2) continue;
            throw error;
          }
        }
      } catch (error) {
        logger.warn(`route ${route}: sync failed \u2014 ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const delay = config.syncDelayMs ?? 2e3;
  const interval = config.intervalMs ?? 216e5;
  ctx.effect(() => {
    let timer;
    let intervalTimer;
    if (config.syncOnStart !== false) {
      timer = setTimeout(() => {
        void syncOnce();
      }, delay);
    }
    intervalTimer = setInterval(() => {
      void syncOnce();
    }, interval);
    return () => {
      if (timer !== void 0) clearTimeout(timer);
      if (intervalTimer !== void 0) clearInterval(intervalTimer);
    };
  }, "enpoi-provider-sync schedule");
}
export {
  Config,
  apply,
  inject,
  name
};
