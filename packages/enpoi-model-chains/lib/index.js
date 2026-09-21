// src/index.ts
var name = "enpoi-model-chains";
var inject = ["settings"];
var ORCH_NS = "enpoi-orchestration";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmptyString(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed === "" ? void 0 : trimmed;
}
function parseChainEntry(id, raw, warn) {
  if (raw === void 0 || raw === null) return void 0;
  if (!isRecord(raw)) {
    warn(`[enpoi-model-chains] chain "${id}" is not an object \u2014 ignored
`);
    return void 0;
  }
  if (raw.disabled === true) return void 0;
  const rawLinks = raw.links;
  if (!Array.isArray(rawLinks)) {
    warn(`[enpoi-model-chains] chain "${id}" has no links array \u2014 ignored
`);
    return void 0;
  }
  const links = [];
  let dropped = 0;
  for (const candidate of rawLinks) {
    if (!isRecord(candidate)) {
      dropped += 1;
      continue;
    }
    const provider = nonEmptyString(candidate.provider);
    const model = nonEmptyString(candidate.model);
    if (provider === void 0 || model === void 0) {
      dropped += 1;
      continue;
    }
    const effort = nonEmptyString(candidate.effort);
    links.push(Object.freeze({ provider, model, ...effort !== void 0 ? { effort } : {} }));
  }
  if (dropped > 0) {
    warn(`[enpoi-model-chains] chain "${id}": dropped ${dropped} malformed link(s) \u2014 provider and model are required
`);
  }
  if (links.length === 0) {
    warn(`[enpoi-model-chains] chain "${id}" has no usable links \u2014 ignored
`);
    return void 0;
  }
  const label = nonEmptyString(raw.label);
  const attemptsValue = raw.attempts;
  const attempts = typeof attemptsValue === "number" && Number.isFinite(attemptsValue) && attemptsValue >= 1 ? Math.floor(attemptsValue) : void 0;
  const onCut = raw.onCut === "continue" ? "continue" : raw.onCut === "failover" ? "failover" : void 0;
  return Object.freeze({
    id,
    ...label !== void 0 ? { label } : {},
    links: Object.freeze(links),
    ...attempts !== void 0 ? { attempts } : {},
    ...onCut !== void 0 ? { onCut } : {}
  });
}
function readRawChains(ctx) {
  try {
    const settings = ctx.get("settings");
    const doc = settings?.get?.(ORCH_NS);
    if (!isRecord(doc)) return {};
    const chains = doc.chains;
    if (chains === void 0) return {};
    if (!isRecord(chains)) {
      process.stderr.write(`[enpoi-model-chains] "${ORCH_NS}.chains" is not a map \u2014 ignored
`);
      return {};
    }
    return chains;
  } catch (error) {
    process.stderr.write(`[enpoi-model-chains] cannot read "${ORCH_NS}.chains": ${String(error)}
`);
    return {};
  }
}
var ModelChainsResolver = class {
  /**
   * @param readRaw - reader for the raw `chains` map (ctx-bound in production).
   */
  constructor(readRaw) {
    this.readRaw = readRaw;
    this.raw = this.readRaw();
  }
  raw;
  cache = /* @__PURE__ */ new Map();
  warned = /* @__PURE__ */ new Set();
  /** Re-read the settings document; the next resolve builds fresh snapshots. */
  refresh() {
    this.raw = this.readRaw();
    this.cache.clear();
  }
  /**
   * Resolve one chain id against the current snapshot.
   * @param id - chain id.
   * @returns the frozen chain, or undefined (unknown/disabled/malformed).
   */
  resolve(id) {
    const key = typeof id === "string" ? id.trim() : "";
    if (key === "") return void 0;
    if (this.cache.has(key)) return this.cache.get(key);
    let reported = false;
    const chain = parseChainEntry(key, this.raw[key], (line) => {
      if (reported || this.warned.has(key)) return;
      reported = true;
      this.warned.add(key);
      process.stderr.write(line);
    });
    if (chain !== void 0) this.warned.delete(key);
    this.cache.set(key, chain);
    return chain;
  }
};
function apply(ctx) {
  const resolver = new ModelChainsResolver(() => readRawChains(ctx));
  ctx.provide("modelChains", { resolve: (id) => resolver.resolve(id) });
  const onNamespaceChange = ((ns) => {
    if (String(ns) !== ORCH_NS) return;
    resolver.refresh();
  });
  ctx.on("settings/document-updated", onNamespaceChange);
  ctx.on("settings/updated", onNamespaceChange);
  process.stderr.write("[enpoi-model-chains] mounted\n");
}
export {
  ModelChainsResolver,
  apply,
  inject,
  name,
  parseChainEntry,
  readRawChains
};
