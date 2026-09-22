// src/index.ts
import Schema from "schemastery";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

// src/board.ts
var WHITEBOARD_CONTEXT_ORDER = 140;
var WHITEBOARD_CONTEXT_NAME = "whiteboard";
var WHITEBOARD_HEADER = "### Pinned context";
var DEFAULT_BUDGET_TOKENS = 1500;
var CHARS_PER_TOKEN = 4;
var EMPTY_WHITEBOARD = Object.freeze({
  version: 0,
  scope: "global",
  entries: [],
  updatedAt: 0
});
var KINDS = ["path", "rule", "fact", "task"];
var SCOPES = ["session", "project", "global"];
function isWhiteboardScope(value) {
  return typeof value === "string" && SCOPES.includes(value);
}
function isWhiteboardEntryKind(value) {
  return typeof value === "string" && KINDS.includes(value);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeEntry(raw) {
  if (!isRecord(raw)) return void 0;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  const kind = isWhiteboardEntryKind(raw.kind) ? raw.kind : void 0;
  if (text.length === 0 || kind === void 0) return void 0;
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `wb-${Math.random().toString(36).slice(2, 10)}`;
  const version = typeof raw.version === "number" && Number.isFinite(raw.version) && raw.version >= 1 ? Math.floor(raw.version) : 1;
  const entry = {
    id,
    kind,
    text,
    pinned: raw.pinned === true,
    pinnedAt: typeof raw.pinnedAt === "number" && Number.isFinite(raw.pinnedAt) ? raw.pinnedAt : 0,
    version
  };
  if (typeof raw.lastValidatedAt === "number" && Number.isFinite(raw.lastValidatedAt)) entry.lastValidatedAt = raw.lastValidatedAt;
  if (raw.stale === true) entry.stale = true;
  return entry;
}
function normalizeDoc(raw) {
  if (!isRecord(raw)) return { ...EMPTY_WHITEBOARD, entries: [] };
  const entries = Array.isArray(raw.entries) ? raw.entries.map(normalizeEntry).filter((entry) => entry !== void 0) : [];
  const version = typeof raw.version === "number" && Number.isFinite(raw.version) && raw.version >= 0 ? Math.floor(raw.version) : 0;
  const doc = {
    version,
    scope: isWhiteboardScope(raw.scope) ? raw.scope : "global",
    entries,
    updatedAt: typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0
  };
  if (typeof raw.sessionId === "string" && raw.sessionId.length > 0) doc.sessionId = raw.sessionId;
  if (typeof raw.projectId === "string" && raw.projectId.length > 0) doc.projectId = raw.projectId;
  return doc;
}
function renderWhiteboard(doc) {
  if (doc.entries.length === 0) return "";
  const lines = doc.entries.slice().sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return 0;
  }).map((entry) => {
    const marker = entry.pinned ? "\u{1F4CC} " : "";
    const stale = entry.stale === true ? " (stale)" : "";
    return `- ${marker}[${entry.kind}] ${entry.text}${stale}`;
  });
  return `${WHITEBOARD_HEADER} (v${doc.version})
${lines.join("\n")}`;
}
function boardChars(rendered) {
  return Array.from(rendered).length;
}
function estimateTokens(rendered) {
  return Math.ceil(boardChars(rendered) / CHARS_PER_TOKEN);
}
function budgetChars(budgetTokens) {
  return Math.max(0, Math.floor(budgetTokens)) * CHARS_PER_TOKEN;
}
function checkBudget(doc, budgetTokens) {
  const chars = boardChars(renderWhiteboard(doc));
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN);
  const limit = budgetChars(budgetTokens);
  return { ok: chars <= limit, tokens, budget: budgetTokens, chars, limit };
}
function lintPaths(doc, resolvePath, exists, now) {
  const stale = [];
  const entries = doc.entries.map((entry) => {
    if (entry.kind !== "path") return entry;
    let resolved;
    try {
      resolved = resolvePath(entry);
    } catch {
      resolved = entry.text;
    }
    const present = resolved.length > 0 && exists(resolved);
    const next = { ...entry, lastValidatedAt: now };
    if (present) delete next.stale;
    else {
      next.stale = true;
      stale.push(entry.id);
    }
    return next;
  });
  return { doc: { ...doc, entries }, stale };
}
function applyWrites(doc, requests, mode, now) {
  const entries = doc.entries.map((entry) => ({ ...entry }));
  for (const request of requests) {
    if (!isWhiteboardEntryKind(request.kind)) return { ok: false, message: `unknown entry kind "${String(request.kind)}"` };
    const text = typeof request.text === "string" ? request.text.trim() : "";
    if (text.length === 0) return { ok: false, message: "entry text must be a non-empty string" };
    if (mode === "replace") {
      const id2 = request.replaceId ?? request.id;
      if (typeof id2 !== "string" || id2.length === 0) return { ok: false, message: 'mode "replace" requires each entry to carry the id it replaces' };
      const index = entries.findIndex((entry) => entry.id === id2);
      if (index === -1) return { ok: false, message: `no entry with id "${id2}" to replace` };
      const previous = entries[index];
      const next = {
        id: id2,
        kind: request.kind,
        text,
        pinned: request.pinned ?? previous.pinned,
        pinnedAt: request.pinned === true && previous.pinned !== true ? now : previous.pinnedAt,
        version: previous.version + 1
      };
      entries[index] = next;
      continue;
    }
    const id = typeof request.id === "string" && request.id.length > 0 ? request.id : `wb-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (entries.some((entry) => entry.id === id)) {
      return { ok: false, message: `entry id "${id}" already exists \u2014 use mode "replace" to overwrite it` };
    }
    entries.push({
      id,
      kind: request.kind,
      text,
      pinned: request.pinned === true,
      pinnedAt: request.pinned === true ? now : 0,
      version: 1
    });
  }
  return { ok: true, doc: { ...doc, entries } };
}
function setPinned(doc, id, pinned, now) {
  const index = doc.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, message: `no entry with id "${id}"` };
  const entries = doc.entries.map((entry, at) => at === index ? { ...entry, pinned, pinnedAt: pinned ? now : entry.pinnedAt } : { ...entry });
  return { ok: true, doc: { ...doc, entries } };
}
function boardApplies(doc, facts) {
  if (doc.entries.length === 0) return false;
  if (doc.scope === "global") return true;
  if (doc.scope === "project") {
    if (doc.projectId === void 0 || facts.projectId === void 0) return false;
    return doc.projectId === facts.projectId;
  }
  if (doc.sessionId === void 0) return false;
  return doc.sessionId === facts.sessionId || doc.sessionId === facts.parentSessionId;
}
function versionLine(doc) {
  return `${WHITEBOARD_HEADER} v${doc.version} (${doc.scope}${doc.updatedAt > 0 ? ` \xB7 updated ${new Date(doc.updatedAt).toISOString()}` : ""})`;
}

// src/index.ts
var name = "enpoi-whiteboard";
var inject = ["tools"];
var Config = Schema.object({
  budgetTokens: Schema.number().default(DEFAULT_BUDGET_TOKENS)
});
var ORCH_NS = "enpoi-orchestration";
function settingsOf(ctx) {
  try {
    return ctx.get("settings");
  } catch {
    return void 0;
  }
}
function readWhiteboard(ctx) {
  try {
    return normalizeDoc(settingsOf(ctx)?.get?.(ORCH_NS)?.whiteboard);
  } catch {
    return normalizeDoc(void 0);
  }
}
function toolCwd(exec) {
  const cwd = exec?.agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : process.cwd();
}
function resolveEntryPath(entry, cwd) {
  return isAbsolute(entry.text) ? entry.text : resolve(cwd, entry.text);
}
function refusal(message, extra = {}) {
  return { ok: false, reason: "refused", message, ...extra };
}
async function commitBoard(ctx, config, build) {
  const settings = settingsOf(ctx);
  if (settings?.mutate === void 0) return { ok: false, message: "settings service unavailable \u2014 board not written" };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = Date.now();
    const current = readWhiteboard(ctx);
    const built = build(current, now);
    if (!built.ok) return { ok: false, message: built.message };
    const next = { ...built.doc, version: current.version + 1, updatedAt: now };
    const check = checkBudget(next, config.budgetTokens);
    if (!check.ok) {
      return {
        ok: false,
        message: `Over budget: the board renders ${check.tokens} tokens (budget ${check.budget}). Nothing was written.`,
        tokens: check.tokens,
        budget: check.budget
      };
    }
    const revision = settings.describe?.().find((entry) => entry.ns === ORCH_NS)?.revision;
    try {
      await settings.mutate(ORCH_NS, [{ op: "set", path: ["whiteboard"], value: next }], revision);
      return { ok: true, doc: next };
    } catch (error) {
      lastError = error;
      if (error?.code === "SETTINGS_CONFLICT" && attempt < 2) continue;
      return { ok: false, message: `board write failed: ${String(error)}` };
    }
  }
  return { ok: false, message: `board write failed after retries: ${String(lastError)}` };
}
function linted(doc, exec) {
  const cwd = toolCwd(exec);
  return lintPaths(doc, (entry) => resolveEntryPath(entry, cwd), existsSync, Date.now()).doc;
}
function boardView(doc, budgetTokens) {
  const rendered = renderWhiteboard(doc);
  const entries = doc.entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    text: entry.text,
    pinned: entry.pinned,
    version: entry.version,
    ...entry.stale === true ? { stale: true } : {}
  }));
  const stale = doc.entries.filter((entry) => entry.stale === true).map((entry) => entry.id);
  return {
    ok: true,
    version: doc.version,
    scope: doc.scope,
    tokens: estimateTokens(rendered),
    budget: budgetTokens,
    entries,
    stale,
    rendered,
    versionLine: versionLine(doc)
  };
}
function registerTools(ctx, config) {
  const tools = ctx.tools;
  if (tools?.register === void 0) {
    process.stderr.write("[enpoi-whiteboard] no tools service \u2014 board tools not mounted\n");
    return;
  }
  tools.register({
    name: "whiteboard_read",
    description: "Read the pinned shared context board (orchestrator-authored core context injected into every agent). Returns entries, the rendered block, its token cost, and stale path flags.",
    parameters: { type: "object", properties: {}, required: [] },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean" },
          version: { type: "number" },
          scope: { type: "string" },
          tokens: { type: "number" },
          budget: { type: "number" },
          entries: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                kind: { type: "string" },
                text: { type: "string" },
                pinned: { type: "boolean" },
                version: { type: "number" },
                stale: { type: "boolean" }
              },
              required: ["id", "kind", "text", "pinned", "version"]
            }
          },
          stale: { type: "array", items: { type: "string" } },
          rendered: { type: "string" },
          versionLine: { type: "string" }
        },
        required: ["ok", "version", "scope", "tokens", "budget", "entries", "stale", "rendered", "versionLine"]
      },
      render: (_args, value) => [{ type: "text", text: renderWhiteboardResult(value) }]
    },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      return boardView(linted(readWhiteboard(ctx), exec), config.budgetTokens);
    }
  });
  tools.register({
    name: "whiteboard_write",
    description: [
      "Author the pinned shared context board: append entries, or replace entries by id (every replace bumps the entry version).",
      "Kinds: path (project-relative path \u2014 validated on write, flagged stale when missing, never deleted), rule, fact, task.",
      "The rendered board has a HARD token budget; an over-budget write is refused and nothing changes.",
      "Keep only core context the orchestrator must not have to repeat: current docs, invariants, task state."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["append", "replace"], description: "append (default) adds entries; replace overwrites the entry named by replaceId" },
        scope: { type: "string", enum: ["session", "project", "global"], description: "Where the board applies (default: keep the current scope)" },
        sessionId: { type: "string", description: "Session id when scope=session (default: the calling session)" },
        projectId: { type: "string", description: "Project cwd when scope=project (default: the calling session cwd)" },
        entries: {
          type: "array",
          description: "Entries to write",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", description: "Stable id; required for append-with-known-id, and the old id for replace" },
              kind: { type: "string", enum: ["path", "rule", "fact", "task"] },
              text: { type: "string", description: "One compact line" },
              pinned: { type: "boolean", description: "Pinned entries sort first and are never compacted" }
            },
            required: ["kind", "text"]
          }
        }
      },
      required: ["entries"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean" },
          reason: { type: "string" },
          message: { type: "string" },
          tokens: { type: "number" },
          budget: { type: "number" },
          version: { type: "number" },
          scope: { type: "string" },
          entries: { type: "array", items: { type: "object", additionalProperties: true } },
          stale: { type: "array", items: { type: "string" } },
          rendered: { type: "string" },
          versionLine: { type: "string" },
          note: { type: "string" }
        },
        required: ["ok"]
      },
      render: (_args, value) => [{ type: "text", text: renderWriteResult(value) }]
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const mode = args.mode === "replace" ? "replace" : "append";
      const rawEntries = args.entries;
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) return refusal("entries must be a non-empty array");
      const requests = [];
      for (const raw of rawEntries) {
        const row = raw;
        const kind = row.kind;
        if (kind !== "path" && kind !== "rule" && kind !== "fact" && kind !== "task") {
          return refusal(`entries[].kind must be one of path|rule|fact|task (got ${JSON.stringify(kind)})`);
        }
        requests.push({
          kind,
          text: typeof row.text === "string" ? row.text : "",
          ...typeof row.id === "string" ? { id: row.id } : {},
          ...mode === "replace" && typeof row.id === "string" ? { replaceId: row.id } : {},
          ...row.pinned === true ? { pinned: true } : {}
        });
      }
      const facts = scopeFactsForWrite(ctx, exec, args);
      const committed = await commitBoard(ctx, config, (doc, now) => {
        const shaped = { ...doc, ...facts };
        const applied = applyWrites(shaped, requests, mode, now);
        if (!applied.ok) return applied;
        return { ok: true, doc: linted(applied.doc, exec) };
      });
      if (!committed.ok) return refusal(committed.message, committed.tokens === void 0 ? {} : { tokens: committed.tokens, budget: committed.budget });
      const stale = committed.doc.entries.filter((entry) => entry.stale === true).map((entry) => entry.id);
      return {
        ...boardView(committed.doc, config.budgetTokens),
        note: stale.length > 0 ? `${stale.length} path entry(ies) flagged stale (missing on disk) \u2014 prune or repoint them` : "written"
      };
    }
  });
  tools.register({
    name: "whiteboard_pin",
    description: "Pin a whiteboard entry: pinned entries sort first and are never compacted. Pinning never rewrites the entry text.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Entry id from whiteboard_read" } },
      required: ["id"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" }, reason: { type: "string" }, message: { type: "string" }, version: { type: "number" }, tokens: { type: "number" }, budget: { type: "number" }, entries: { type: "array", items: { type: "object", additionalProperties: true } }, stale: { type: "array", items: { type: "string" } }, rendered: { type: "string" }, versionLine: { type: "string" }, note: { type: "string" } },
        required: ["ok"]
      },
      render: (_args, value) => [{ type: "text", text: renderWriteResult(value) }]
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const id = typeof args.id === "string" ? args.id : "";
      if (id.length === 0) return refusal("id is required");
      const committed = await commitBoard(ctx, config, (doc, now) => setPinned(doc, id, true, now));
      if (!committed.ok) return refusal(committed.message, committed.tokens === void 0 ? {} : { tokens: committed.tokens, budget: committed.budget });
      return { ...boardView(linted(committed.doc, exec), config.budgetTokens), note: `pinned ${id}` };
    }
  });
  tools.register({
    name: "whiteboard_unpin",
    description: "Unpin a whiteboard entry. Unpinning never deletes the entry; the operator prunes explicitly.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Entry id from whiteboard_read" } },
      required: ["id"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" }, reason: { type: "string" }, message: { type: "string" }, version: { type: "number" }, tokens: { type: "number" }, budget: { type: "number" }, entries: { type: "array", items: { type: "object", additionalProperties: true } }, stale: { type: "array", items: { type: "string" } }, rendered: { type: "string" }, versionLine: { type: "string" }, note: { type: "string" } },
        required: ["ok"]
      },
      render: (_args, value) => [{ type: "text", text: renderWriteResult(value) }]
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const id = typeof args.id === "string" ? args.id : "";
      if (id.length === 0) return refusal("id is required");
      const committed = await commitBoard(ctx, config, (doc, now) => setPinned(doc, id, false, now));
      if (!committed.ok) return refusal(committed.message, committed.tokens === void 0 ? {} : { tokens: committed.tokens, budget: committed.budget });
      return { ...boardView(linted(committed.doc, exec), config.budgetTokens), note: `unpinned ${id}` };
    }
  });
}
function scopeFactsForWrite(ctx, exec, args) {
  const scope = args.scope;
  if (scope !== "session" && scope !== "project" && scope !== "global") return {};
  if (scope === "global") return { scope: "global" };
  if (scope === "project") {
    const projectId = typeof args.projectId === "string" && args.projectId.length > 0 ? args.projectId : exec?.agent?.session?.header?.cwd ?? process.cwd();
    return { scope: "project", projectId };
  }
  const sessionId = typeof args.sessionId === "string" && args.sessionId.length > 0 ? args.sessionId : exec?.agent?.session?.id;
  return typeof sessionId === "string" && sessionId.length > 0 ? { scope: "session", sessionId } : { scope: "session" };
}
function renderWhiteboardResult(value) {
  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (entries.length === 0) return `Whiteboard v${String(value.version)} is empty (0/${String(value.budget)} tokens).`;
  const lines = entries.map((entry) => `\u2022 ${entry.pinned === true ? "\u{1F4CC} " : ""}[${String(entry.kind)}] ${String(entry.text)}${entry.stale === true ? " (stale)" : ""} \u2014 ${String(entry.id)} v${String(entry.version)}`);
  return [...lines, `\u2014 v${String(value.version)} \xB7 ${String(value.tokens)}/${String(value.budget)} tokens`].join("\n");
}
function renderWriteResult(value) {
  if (value.ok !== true) return String(value.message ?? "Whiteboard write refused.");
  const stale = Array.isArray(value.stale) ? value.stale : [];
  const head = `Whiteboard v${String(value.version)} \u2014 ${stale.length} stale path flag(s).`;
  const rendered = typeof value.rendered === "string" && value.rendered.length > 0 ? value.rendered : "(empty)";
  return `${head}
${rendered}`;
}
function installInjection(ctx) {
  const systemPrompt = ctx.get("systemPrompt");
  if (systemPrompt?.context === void 0) {
    process.stderr.write("[enpoi-whiteboard] no systemPrompt service \u2014 runtime-context injection skipped\n");
    return;
  }
  const dispose = systemPrompt.context({
    name: WHITEBOARD_CONTEXT_NAME,
    order: WHITEBOARD_CONTEXT_ORDER,
    text: (assembly) => {
      try {
        const doc = readWhiteboard(ctx);
        const facts = {};
        const session = assembly?.agent?.session;
        if (typeof session?.id === "string") facts.sessionId = session.id;
        const parent = session?.header?.parentSession;
        if (typeof parent === "string") facts.parentSessionId = parent;
        const cwd = session?.header?.cwd;
        if (typeof cwd === "string") facts.projectId = cwd;
        if (!boardApplies(doc, facts)) return "";
        return renderWhiteboard(doc);
      } catch {
        return "";
      }
    }
  });
  ctx.effect(() => dispose, "enpoi-whiteboard: runtime-context injection");
}
function apply(ctx, config = {}) {
  const resolved = {
    budgetTokens: typeof config.budgetTokens === "number" && Number.isFinite(config.budgetTokens) && config.budgetTokens > 0 ? Math.floor(config.budgetTokens) : DEFAULT_BUDGET_TOKENS
  };
  registerTools(ctx, resolved);
  installInjection(ctx);
  process.stderr.write(`[enpoi-whiteboard] mounted (budget ${resolved.budgetTokens} tokens; board read lazily per assembly; runtime-context seam)
`);
}
export {
  Config,
  apply,
  inject,
  name,
  readWhiteboard
};
