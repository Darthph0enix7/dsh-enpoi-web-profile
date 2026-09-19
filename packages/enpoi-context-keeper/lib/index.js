var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose, inner;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) {
      dispose = value[__knownSymbol("dispose")];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") __typeError("Object not disposable");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail(e), next()));
      } catch (e) {
        fail(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};

// src/index.ts
import { SessionLogOffset } from "@deepseek-ai/dsh-session";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { appendFileSync, mkdirSync } from "node:fs";
import { openMemoryDb } from "dsh-enpoi-memory";
import { makePipeline } from "dsh-enpoi-memory";
import { join } from "node:path";
import Schema from "schemastery";
var name = "enpoi-context-keeper";
var inject = ["llm"];
function diag(line) {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? "/tmp";
    const dir = join(home.endsWith(".dsh") ? home : join(home, ".dsh"), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "enpoi-keeper.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
function keeperEnabled(ctx) {
  try {
    const settings = ctx.get("settings");
    const tools = settings?.get?.("enpoi-orchestration")?.capabilities?.tools;
    return tools?.["keeper"] !== false;
  } catch {
    return true;
  }
}
var Config = Schema.object({
  provider: Schema.string().default("freellmapi"),
  model: Schema.string().default("auto"),
  fallbackProvider: Schema.string().default("antigravity"),
  fallbackModel: Schema.string().default("gemini-3.7-flash-tiered"),
  leaseMs: Schema.number().default(45e3),
  maxInputEvents: Schema.number().default(80),
  maxOutputTokens: Schema.number().default(2048),
  structuralDistanceK: Schema.number().default(24),
  minRefreshMs: Schema.number().default(6e4),
  negativeCacheMs: Schema.number().default(12e4),
  claimsBatchSize: Schema.number().default(8),
  claimsBatchMinutes: Schema.number().default(5)
});
var PROSE_PROMPT = [
  "You are the Enpoi Harness context keeper \u2014 the master background summarizer and architectural keeper for this coding session.",
  "You maintain a running, concise, and highly accurate Living Brief of the session for later dispatch to the Oracle and Council debaters.",
  "If a [PREVIOUS SESSION BRIEF] is provided, incrementally merge it with the [RECENT SESSION EVENTS & TOOL RESULTS] (including Council/Roundtable consensus, Oracle verdicts, subagent returns, tool results, documentation paths, and user directives).",
  "NEVER extract, repeat, or retain credentials, passwords, API keys, tokens, or personal secrets.",
  "",
  "CRITICAL SECTION DISCIPLINE (ZERO-FILLER RULE):",
  "- ONLY include a section if there is genuine, substantive information established in the session.",
  '- If no documentation files were created or referenced, DO NOT emit the \u{1F4DA} section and NEVER write "No documentation...".',
  '- If no approaches were debated/rejected, DO NOT emit the \u{1F6AB} section and NEVER write "No alternative approaches...".',
  '- If there are no open blockers, DO NOT emit the \u26A1 section and NEVER write "No blockers remain...".',
  "- For simple queries, greetings, or health-checks (e.g. ping), emit ONLY a single-line \u{1F3AF} ACTIVE GOAL or keep the brief empty. NEVER invent placeholder bullets.",
  "",
  "Output ONLY the relevant section headers from below (omit any section with no substantive content):",
  "",
  "\u{1F3AF} ACTIVE GOAL & CORE TRAJECTORY:",
  "- Current active objective, user directives, and high-level technical paradigms.",
  "",
  "\u{1F4DA} DOCUMENTATION & SPECIFICATIONS INVENTORY:",
  "- List documentation, plans, architectures, and spec files written, modified, or referenced in the session with a 1-line summary.",
  "",
  "\u{1F3DB}\uFE0F ARCHITECTURAL INVARIANTS & CONCRETE DECISIONS:",
  "- Concrete technical decisions established in the session: exact component boundaries, protocols (IPC/HTTP/WS/Redis), data keys/schemas, state machines, and concurrency rules.",
  "",
  "\u{1F6AB} REJECTED APPROACHES & EDGE CASES:",
  "- Approaches debated and explicitly ruled out (and reasons why), edge cases handled, and failure modes defended.",
  "",
  "\u26A1 ACTIVE BLOCKERS & OPEN QUESTIONS:",
  "- Unresolved technical questions, pending implementation tasks, or immediate next steps.",
  "",
  "No other text at all \u2014 no preamble, no CLAIMS block, no JSON."
].join("\n");
var CLAIMS_PROMPT = [
  "You are the Enpoi Harness memory extractor. From the [RECENT SESSION EVENTS & TOOL RESULTS] below, extract durable, permanent facts about Adam's environment, infrastructure, and architecture.",
  "NEVER extract, repeat, or retain credentials, passwords, API keys, tokens, or personal secrets.",
  "",
  'Output EXACTLY one line: "CLAIMS:" followed by a JSON array: [{"fact":"...","category":"ARCHITECTURE","tags":"...","source":"tool"}]',
  "- category limited to ARCHITECTURE, CONFIG_VALUES, or PROJECT.",
  '- source MUST be "tool" when the fact is derived from tool results/executions (verified by execution), or "chat" when it was stated by the user or assistant in conversation.',
  '- File 2-4 durable facts whenever the session surfaces them; else "CLAIMS: []".',
  "- Skip transient chatter and anything already obvious from the session itself.",
  "No other text at all."
].join("\n");
var STRUCTURAL_TYPES = /* @__PURE__ */ new Set(["user/message", "turn/end", "tool/call", "tool/result"]);
var structuralCounters = /* @__PURE__ */ new WeakMap();
function structuralTotal(session) {
  const known = structuralCounters.get(session);
  if (known === void 0) {
    let count2 = 0;
    for (const event of session.snapshotEvents()) {
      if (STRUCTURAL_TYPES.has(event.type)) count2 += 1;
    }
    structuralCounters.set(session, { seq: session.seq, total: count2 });
    return count2;
  }
  if (session.seq <= known.seq) return known.total;
  let count = known.total;
  for (const event of session.snapshotEvents(SessionLogOffset(known.seq))) {
    if (STRUCTURAL_TYPES.has(event.type)) count += 1;
  }
  structuralCounters.set(session, { seq: session.seq, total: count });
  return count;
}
function resolveKeeperParams(ctx, config) {
  try {
    const settings = ctx.get("settings");
    const p = settings?.get?.("enpoi-orchestration")?.parameters?.keeper;
    if (p === void 0 || typeof p !== "object") return config;
    const clamp = (v, fallback, min, max) => typeof v === "number" && !Number.isNaN(v) ? Math.min(max, Math.max(min, v)) : fallback;
    return {
      ...config,
      leaseMs: clamp(p.leaseMs, config.leaseMs ?? 45e3, 15e3, 12e4),
      maxInputEvents: clamp(p.maxInputEvents, config.maxInputEvents ?? 80, 20, 200),
      maxOutputTokens: clamp(p.maxOutputTokens, config.maxOutputTokens ?? 2048, 512, 4096),
      structuralDistanceK: clamp(p.structuralDistanceK, config.structuralDistanceK ?? 24, 4, 200),
      minRefreshMs: clamp(p.minRefreshMs, config.minRefreshMs ?? 6e4, 5e3, 3e5),
      negativeCacheMs: clamp(p.negativeCacheMs, config.negativeCacheMs ?? 12e4, 5e3, 6e5),
      claimsBatchSize: clamp(p.claimsBatchSize, config.claimsBatchSize ?? 8, 1, 50),
      claimsBatchMinutes: clamp(p.claimsBatchMinutes, config.claimsBatchMinutes ?? 5, 1, 60)
    };
  } catch {
    return config;
  }
}
function resolveKeeperRoute(ctx, config) {
  const fallbackProvider = config.fallbackProvider ?? "antigravity";
  const fallbackModel = config.fallbackModel ?? "gemini-3.7-flash-tiered";
  try {
    const settings = ctx.get("settings");
    const entry = settings?.get?.("enpoi-orchestration")?.personas?.["keeper"];
    if (entry && entry.provider && entry.model) {
      return {
        provider: entry.provider,
        model: entry.model,
        fallbackProvider,
        fallbackModel,
        ...entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}
      };
    }
  } catch {
  }
  return {
    provider: config.provider ?? "freellmapi",
    model: config.model ?? "auto",
    fallbackProvider,
    fallbackModel
  };
}
function emptyEntry() {
  return {
    basedOnSeq: 0,
    basedOnStructuralCount: 0,
    prose: "",
    model: "",
    updatedAt: 0,
    negativeUntil: 0,
    inFlight: null,
    inFlightSnapshotSeq: 0,
    inFlightStructural: 0
  };
}
var BriefService = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  cache = /* @__PURE__ */ new Map();
  /**
   * Materialize (or reuse) the session's prose brief.
   *
   * Cache policy: negative-cache → anti-thrash floor → structural distance →
   * single-flight join → distill. Never throws for provider failures — it
   * returns `{ ok: false }` (soft-degrading, frozen doc principle). Throws
   * only when the CALLER's signal aborts (the consumer is being cancelled).
   */
  async ensureFreshBrief(session, signal) {
    if (!keeperEnabled(this.ctx)) {
      return { ok: false, prose: null, reason: "keeper-disabled" };
    }
    const key = session.id;
    const cfg = resolveKeeperParams(this.ctx, this.config);
    const entry = this.cache.get(key);
    const now = Date.now();
    if (entry !== void 0 && entry.negativeUntil > now) {
      return { ok: false, prose: null, reason: "negative-cached" };
    }
    if (entry !== void 0 && entry.prose.length > 0 && now - entry.updatedAt < (cfg.minRefreshMs ?? 6e4)) {
      return { ok: true, prose: entry.prose, model: entry.model, reason: "cache-hit" };
    }
    if (entry !== void 0 && entry.prose.length > 0) {
      const distance = structuralTotal(session) - entry.basedOnStructuralCount;
      if (distance <= (cfg.structuralDistanceK ?? 24)) {
        return { ok: true, prose: entry.prose, model: entry.model, reason: "cache-hit" };
      }
    }
    if (entry !== void 0 && entry.inFlight !== null) {
      const inFlightDistance = structuralTotal(session) - entry.inFlightStructural;
      if (inFlightDistance <= (cfg.structuralDistanceK ?? 24)) {
        try {
          return await entry.inFlight;
        } catch (error) {
          if (signal?.aborted) throw error;
          return { ok: false, prose: null, reason: "failed" };
        }
      }
    }
    const snapshotSeq = session.seq;
    const promise = this.distill(session, signal, snapshotSeq, cfg);
    this.cache.set(key, {
      ...entry ?? emptyEntry(),
      inFlight: promise,
      inFlightSnapshotSeq: snapshotSeq,
      inFlightStructural: structuralTotal(session)
    });
    try {
      return await promise;
    } finally {
      const current = this.cache.get(key);
      if (current !== void 0 && current.inFlight === promise) {
        this.cache.set(key, { ...current, inFlight: null });
      }
    }
  }
  /** One distillation pass: lease-bound LLM call, then append + cache. */
  async distill(session, signal, snapshotSeq, cfg) {
    const lease = new AbortController();
    const leaseTimer = setTimeout(() => lease.abort(), cfg.leaseMs ?? 45e3);
    const combined = signal !== void 0 ? AbortSignal.any([signal, lease.signal]) : lease.signal;
    try {
      const input = frameInput(session, cfg.maxInputEvents ?? 80);
      if (input.length === 0) {
        diag(`ensureFreshBrief: session=${session.id} \u2014 empty input, skipping`);
        return { ok: false, prose: null, reason: "failed" };
      }
      const route = resolveKeeperRoute(this.ctx, cfg);
      const snapshotStructural = structuralTotal(session);
      diag(`ensureFreshBrief: session=${session.id} \u2014 calling LLM (input ${input.length} chars, route ${route.provider}/${route.model}, basedOnSeq ${snapshotSeq})`);
      const result = await summarize(this.ctx, cfg, session, input, combined, route, PROSE_PROMPT, false);
      const prose = cleanKeeperProse(result.text);
      if (prose.length === 0) {
        diag(`ensureFreshBrief: session=${session.id} \u2014 empty or cleaned-empty prose, skipping`);
        return { ok: false, prose: null, reason: "failed" };
      }
      session.append("brief/prose-updated", {
        basedOnSeq: snapshotSeq,
        basedOnStructuralCount: snapshotStructural,
        structuralDistanceK: cfg.structuralDistanceK ?? 24,
        model: result.route,
        text: prose,
        origin: "context-keeper"
      });
      const current = this.cache.get(session.id);
      this.cache.set(session.id, {
        ...current ?? emptyEntry(),
        basedOnSeq: snapshotSeq,
        basedOnStructuralCount: snapshotStructural,
        prose,
        model: result.route,
        updatedAt: Date.now(),
        negativeUntil: 0
      });
      diag(`ensureFreshBrief: session=${session.id} \u2014 appended brief/prose-updated via ${result.route} (${prose.length} chars, basedOnSeq ${snapshotSeq})`);
      return { ok: true, prose, model: result.route, reason: "distilled" };
    } catch (error) {
      if (signal?.aborted) throw error;
      const entry = this.cache.get(session.id);
      this.cache.set(session.id, {
        ...entry ?? emptyEntry(),
        negativeUntil: Date.now() + (cfg.negativeCacheMs ?? 12e4)
      });
      diag(`ensureFreshBrief: session=${session.id} \u2014 FAILED ${String(error)} (negative-cached ${cfg.negativeCacheMs ?? 12e4}ms)`);
      return { ok: false, prose: null, reason: "failed" };
    } finally {
      clearTimeout(leaseTimer);
    }
  }
};
var BRIEF_SERVICE_ANCHOR = Symbol.for("enpoi.context-keeper.brief-service");
var briefService = null;
function getBriefService() {
  const anchored = globalThis[BRIEF_SERVICE_ANCHOR];
  return anchored ?? briefService;
}
function createBriefService(ctx, config) {
  return new BriefService(ctx, config);
}
function apply(ctx, config) {
  const ownedService = createBriefService(ctx, config);
  briefService = ownedService;
  globalThis[BRIEF_SERVICE_ANCHOR] = ownedService;
  diag(`apply: mounted (demand-driven; prose on oracle/council use, claims batched ${config.claimsBatchSize ?? 8}/${config.claimsBatchMinutes ?? 5}min)`);
  const claimCounters = /* @__PURE__ */ new Map();
  const claimsRunning = /* @__PURE__ */ new Set();
  ctx.on("session/event", (session, event) => {
    if (STRUCTURAL_TYPES.has(event.type)) {
      const known = structuralCounters.get(session);
      if (known !== void 0) structuralCounters.set(session, { seq: event.seq + 1, total: known.total + 1 });
    }
    if (event.type !== "turn/end") return;
    if (!keeperEnabled(ctx)) return;
    const reason = event.data.reason;
    if (reason.kind === "aborted") return;
    let counter = claimCounters.get(session.id);
    if (counter === void 0) {
      counter = { count: 0, timer: null };
      claimCounters.set(session.id, counter);
    }
    counter.count += 1;
    if (counter.timer !== null) clearTimeout(counter.timer);
    counter.timer = setTimeout(() => {
      counter.timer = null;
      void runClaimsPass(ctx, config, session, claimsRunning);
    }, (config.claimsBatchMinutes ?? 5) * 6e4);
    if (counter.count >= (config.claimsBatchSize ?? 8)) {
      counter.count = 0;
      if (counter.timer !== null) {
        clearTimeout(counter.timer);
        counter.timer = null;
      }
      void runClaimsPass(ctx, config, session, claimsRunning);
    }
  });
  ctx.on("dispose", () => {
    for (const counter of claimCounters.values()) {
      if (counter.timer !== null) clearTimeout(counter.timer);
    }
    claimCounters.clear();
    claimsRunning.clear();
    if (briefService === ownedService) briefService = null;
    if (globalThis[BRIEF_SERVICE_ANCHOR] === ownedService) {
      delete globalThis[BRIEF_SERVICE_ANCHOR];
    }
  });
}
async function runClaimsPass(ctx, config, session, running) {
  if (running.has(session.id)) return;
  running.add(session.id);
  const cfg = resolveKeeperParams(ctx, config);
  const lease = new AbortController();
  const leaseTimer = setTimeout(() => lease.abort(), cfg.leaseMs ?? 45e3);
  try {
    const input = frameInput(session, cfg.maxInputEvents ?? 80);
    if (input.length === 0) return;
    const route = resolveKeeperRoute(ctx, cfg);
    diag(`claims: session=${session.id} \u2014 calling LLM (input ${input.length} chars, route ${route.provider}/${route.model})`);
    const result = await summarize(ctx, cfg, session, input, lease.signal, route, CLAIMS_PROMPT, true);
    const claims = splitClaims(result.text);
    if (claims.length === 0) {
      diag(`claims: session=${session.id} \u2014 no claims extracted`);
      return;
    }
    const memDb = openMemoryDb();
    try {
      const mem = makePipeline(memDb);
      const provenance = JSON.stringify({ sessionId: session.id });
      const toolClaims = claims.filter((c) => c.source === "tool");
      const chatClaims = claims.filter((c) => c.source !== "tool");
      if (toolClaims.length > 0) {
        await mem.intake(
          toolClaims.map((c) => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: "keeper", trust: "verified_execution", provenance }
        );
      }
      if (chatClaims.length > 0) {
        await mem.intake(
          chatClaims.map((c) => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: "keeper", trust: "operator", provenance }
        );
      }
      diag(`claims: session=${session.id} \u2014 ${toolClaims.length} tool + ${chatClaims.length} chat claim(s) filed`);
    } finally {
      memDb.close();
    }
  } catch (error) {
    diag(`claims: session=${session.id} \u2014 FAILED ${String(error)}`);
  } finally {
    clearTimeout(leaseTimer);
    running.delete(session.id);
  }
}
function cleanKeeperProse(text) {
  if (!text || text.trim().length === 0) return "";
  const sectionChunks = text.split(/(?=^[🎯📚🏛️🚫⚡]\s*)/m);
  const cleaned = [];
  for (const chunk of sectionChunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const contentLines = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    if (contentLines.length === 0) continue;
    const isAllNegativeFiller = contentLines.every(
      (l) => /^-\s*(no\b|none\b|n\/a\b|nothing\b|not applicable\b)/i.test(l) || /no documentation.*(?:created|referenced|modified|identified)/i.test(l) || /no alternative approaches/i.test(l) || /no blockers/i.test(l) || /no open questions/i.test(l) || /no edge cases/i.test(l)
    );
    if (!isAllNegativeFiller) {
      cleaned.push(trimmed);
    }
  }
  return cleaned.join("\n\n");
}
function splitClaims(text) {
  const idx = text.indexOf("CLAIMS:");
  if (idx === -1) return [];
  const jsonPart = text.slice(idx + "CLAIMS:".length).trim();
  try {
    const m = jsonPart.match(/\[[\s\S]*?\]/);
    if (m === null) return [];
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c) => typeof c === "object" && c !== null && typeof c.fact === "string").map((c) => ({
      fact: String(c.fact).trim().slice(0, 300),
      category: String(c.category ?? "PROJECT").slice(0, 32),
      tags: typeof c.tags === "string" ? c.tags : void 0,
      source: c.source === "tool" ? "tool" : "chat"
    })).filter((c) => c.fact.length > 0);
  } catch {
    diag("splitClaims: CLAIMS JSON parse failed (isolated)");
    return [];
  }
}
function frameInput(session, maxEvents) {
  const events = session.snapshotEvents();
  let previousProse = "";
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "brief/prose-updated") {
      const data = e.data;
      if (typeof data.text === "string" && data.text.length > 0) {
        previousProse = data.text.slice(0, 4e3);
        break;
      }
    }
  }
  const start = Math.max(0, events.length - maxEvents);
  const lines = [];
  const docFiles = /* @__PURE__ */ new Set();
  for (let i = start; i < events.length; i++) {
    const event = events[i];
    if (event.type === "user/message") {
      const text = messageText(event.data.content);
      if (text.length > 0) lines.push(`USER: ${text.slice(0, 2500)}`);
    } else if (event.type === "assistant/message") {
      const data = event.data;
      if (typeof data.text === "string" && data.text.length > 0) {
        lines.push(`ASSISTANT: ${data.text.slice(0, 2500)}`);
      }
    } else if (event.type === "tool/call") {
      const data = event.data;
      const argsStr = typeof data.arguments === "string" && data.arguments.length > 0 ? ` ${data.arguments.slice(0, 600)}` : "";
      lines.push(`TOOL CALL: ${data.name}${argsStr}`);
      if (data.arguments) {
        const matches = data.arguments.match(/["']([^"']*\.(?:md|json|yaml|yml))["']/g);
        if (matches) {
          for (const m of matches) {
            const clean = m.replace(/["']/g, "");
            if (clean.length > 2) docFiles.add(clean);
          }
        }
      }
    } else if (event.type === "tool/result") {
      const resultText = toolResultText(event.data);
      if (resultText.length > 0) {
        lines.push(`TOOL RESULT: ${resultText.slice(0, 4e3)}`);
      }
    }
  }
  const sections = [];
  if (previousProse.length > 0) {
    sections.push(`--- PREVIOUS SESSION BRIEF ---
${previousProse}`);
  }
  if (docFiles.size > 0) {
    sections.push(`--- RECENT SPECIFICATION & DOCUMENTATION FILES ---
${Array.from(docFiles).map((f) => `\u2022 ${f}`).join("\n")}`);
  }
  if (lines.length > 0) {
    sections.push(`--- RECENT SESSION EVENTS & TOOL RESULTS ---
${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}
function toolResultText(data) {
  if (!data || typeof data !== "object") return "";
  const d = data;
  if (d.error?.message) return `Error: ${d.error.message}`;
  if (!d.message || !Array.isArray(d.message.content)) return "";
  const parts = [];
  for (const block of d.message.content) {
    if (typeof block === "string") parts.push(block);
    else if (block && typeof block === "object") {
      const b = block;
      if (typeof b.text === "string") parts.push(b.text);
      if (Array.isArray(b.content)) {
        for (const sub of b.content) {
          if (typeof sub === "string") parts.push(sub);
          else if (sub && typeof sub === "object" && typeof sub.text === "string") {
            parts.push(sub.text);
          }
        }
      }
    }
  }
  return parts.filter(Boolean).join(" ").trim();
}
function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part !== null && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    }).filter((text) => text.length > 0).join(" ");
  }
  return "";
}
function validateKeeperOutput(text, finishKind, expectClaims = false) {
  if (finishKind === "max-tokens") {
    return { valid: false, reason: "Stream truncated by maxOutputTokens limit" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "Empty output received from model" };
  }
  if (expectClaims) {
    const claimsMatch = trimmed.match(/CLAIMS:\s*([\s\S]*)$/i);
    if (claimsMatch) {
      const rawClaims = claimsMatch[1].trim();
      if (/^(none|n\/a|\[\s*\])$/i.test(rawClaims)) {
        return { valid: true };
      }
      const jsonMatch = rawClaims.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        return { valid: false, reason: "CLAIMS tag present but JSON array was truncated/unclosed" };
      }
      try {
        JSON.parse(jsonMatch[0]);
      } catch (e) {
        return { valid: false, reason: `Malformed CLAIMS JSON: ${String(e)}` };
      }
    }
  }
  return { valid: true };
}
async function summarize(ctx, config, session, input, signal, route, systemPrompt, expectClaims) {
  const messages = [createUserMessage({
    content: [{ type: "text", text: input }],
    source: { kind: "plugin", plugin: "enpoi-context-keeper" }
  })];
  const base = {
    provider: route.provider,
    model: route.model,
    messages,
    system: systemPrompt,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    purpose: "context-keeper",
    signal,
    ...route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}
  };
  async function executeRoute(provider, model) {
    const result = await streamTextWithMeta(ctx, { ...base, provider, model });
    const validation = validateKeeperOutput(result.text, result.finishKind, expectClaims);
    if (!validation.valid) {
      throw new Error(`Output invalid/truncated on ${provider}/${model}: ${validation.reason}`);
    }
    return result.text;
  }
  try {
    const text = await executeRoute(route.provider, route.model);
    return { text, route: `${route.provider}/${route.model}` };
  } catch (error) {
    if (signal.aborted) throw error;
    ctx.logger.warn(`enpoi-context-keeper: primary route failed/cut off (${String(error)}), trying fallback`);
    diag(`primary route failed/cut off (${String(error)}), switching to fallback ${route.fallbackProvider}/${route.fallbackModel}`);
    try {
      const fallbackText = await executeRoute(route.fallbackProvider, route.fallbackModel);
      return {
        text: fallbackText,
        route: `${route.fallbackProvider}/${route.fallbackModel}`
      };
    } catch (fallbackError) {
      if (signal.aborted) throw fallbackError;
      throw new Error(`enpoi-context-keeper: all summary routes failed. Primary: ${String(error)}, Fallback: ${String(fallbackError)}`);
    }
  }
}
async function streamTextWithMeta(ctx, options) {
  var _stack = [];
  try {
    const callDeadline = __using(_stack, deadline(options.signal, 4e4, "ENPOI_KEEPER_STREAM_TIMEOUT"));
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({ ...options, signal: callDeadline.signal })) {
      callDeadline.signal.throwIfAborted();
      assembler.push(chunk);
    }
    callDeadline.signal.throwIfAborted();
    const terminalError = finishError(assembler.finish);
    if (terminalError !== void 0) throw terminalError;
    const blocks = assembler.blocks();
    const text = blocks.filter((block) => block.type === "text").map((block) => block.text).join(" ").trim();
    return { text, finishKind: assembler.finish.kind };
  } catch (_) {
    var _error = _, _hasError = true;
  } finally {
    __callDispose(_stack, _error, _hasError);
  }
}
function finishError(finish) {
  switch (finish.kind) {
    case "stop":
      return void 0;
    case "error":
    case "aborted": {
      const failure = finish.failure ?? { message: "unknown failure", code: "UNKNOWN" };
      const error = new Error(failure.message);
      error.code = failure.code;
      return error;
    }
    case "max-tokens":
      return new Error("enpoi-context-keeper: summary output reached maxOutputTokens");
    case "tool-calls":
      return new Error("enpoi-context-keeper: summarizer unexpectedly requested a tool");
    default:
      return void 0;
  }
}
export {
  BriefService,
  Config,
  apply,
  cleanKeeperProse,
  createBriefService,
  getBriefService,
  inject,
  name,
  resolveKeeperParams,
  resolveKeeperRoute,
  splitClaims
};
