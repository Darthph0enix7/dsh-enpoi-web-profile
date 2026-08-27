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

// packages/enpoi-context-keeper/src/index.ts
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { appendFileSync, mkdirSync } from "node:fs";

// packages/enpoi-memory/src/db.ts
import { DatabaseSync } from "node:sqlite";
import * as os from "node:os";
import * as path from "node:path";
var CATEGORIES = ["RULES", "ARCHITECTURE", "CONSTRAINTS", "CONFIG_VALUES", "NAMING", "PROJECT"];
var KEEPER_ALLOWED = /* @__PURE__ */ new Set(["ARCHITECTURE", "CONFIG_VALUES", "PROJECT"]);
function memoryDbPath() {
  return process.env.DSH_MEMORY_DB ?? path.join(os.homedir(), ".dsh", "memory.db");
}
var SCHEMA = `
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  fact TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('tentative','committed','orphaned_cancelled','rescinded')),
  source_trust TEXT NOT NULL CHECK (source_trust IN ('operator','verified_execution','untrusted_external')),
  origin TEXT NOT NULL,
  provenance TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  supersedes TEXT,
  tombstone_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(state);
CREATE INDEX IF NOT EXISTS idx_claims_category ON claims(category);

CREATE VIRTUAL TABLE IF NOT EXISTS claims_fts USING fts5(
  fact, content='claims', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS claims_ai AFTER INSERT ON claims BEGIN
  INSERT INTO claims_fts(rowid, fact) VALUES (new.rowid, new.fact);
END;
CREATE TRIGGER IF NOT EXISTS claims_ad AFTER DELETE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, fact) VALUES ('delete', old.rowid, old.fact);
END;
CREATE TRIGGER IF NOT EXISTS claims_au AFTER UPDATE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, fact) VALUES ('delete', old.rowid, old.fact);
  INSERT INTO claims_fts(rowid, fact) VALUES (new.rowid, new.fact);
END;
`;
function openMemoryDb() {
  const db = new DatabaseSync(memoryDbPath());
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA busy_timeout=5000;");
  db.exec(SCHEMA);
  return db;
}

// packages/enpoi-memory/src/pipeline.ts
import { createHash } from "node:crypto";
var FACT_CAP = 400;
function claimHash(fact, category) {
  return createHash("sha256").update(`${fact}::${category}`).digest("hex").slice(0, 12);
}
var Mutex = class {
  chain = Promise.resolve();
  run(fn) {
    const run2 = this.chain.then(fn, fn);
    this.chain = run2.then(() => void 0, () => void 0);
    return run2;
  }
};
function makePipeline(db) {
  const mutex = new Mutex();
  function txn(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      fn();
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      throw err;
    }
  }
  function get(id) {
    return db.prepare("SELECT * FROM claims WHERE id = ?").get(id);
  }
  function stateOf(id) {
    return get(id)?.state;
  }
  async function intake(claims, opts) {
    return mutex.run(() => {
      const inserted = [];
      txn(() => {
        for (const c of claims) {
          const fact = String(c.fact ?? "").trim();
          if (fact.length === 0 || fact.length > FACT_CAP) continue;
          let category = String(c.category ?? "PROJECT").toUpperCase();
          if (!CATEGORIES.includes(category)) category = "PROJECT";
          if (opts.origin === "keeper" && !KEEPER_ALLOWED.has(category)) category = "PROJECT";
          const hash = claimHash(fact, category);
          const existing = db.prepare("SELECT * FROM claims WHERE id = ?").get(`claim-${hash}`);
          if (existing !== void 0) {
            if (existing.state === "rescinded") {
              continue;
            }
            if (opts.trust === "operator" && existing.state !== "committed") {
              db.prepare(`UPDATE claims SET state = 'committed', source_trust = 'operator', origin = ?, committed_at = ? WHERE id = ?`).run(opts.origin, Date.now(), existing.id);
              inserted.push(get(existing.id));
              continue;
            }
            if (existing.state === "orphaned_cancelled" && opts.trust === "verified_execution" && opts.parentAborted !== true) {
              db.prepare(`UPDATE claims SET state = 'committed', source_trust = ?, origin = ?, committed_at = ? WHERE id = ?`).run(opts.trust, opts.origin, Date.now(), existing.id);
              inserted.push(get(existing.id));
              continue;
            }
            continue;
          }
          const owner = db.prepare(
            `SELECT id FROM claims WHERE fact = ? AND state = 'committed' AND source_trust = 'operator' LIMIT 1`
          ).get(fact);
          if (owner !== void 0 && opts.trust !== "operator") {
            continue;
          }
          const state = opts.parentAborted ? "orphaned_cancelled" : opts.trust === "untrusted_external" ? "tentative" : "committed";
          const now = Date.now();
          db.prepare(
            `INSERT INTO claims (id, fact, category, tags, state, source_trust, origin, provenance, created_at, committed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            `claim-${hash}`,
            fact,
            category,
            c.tags ?? "",
            state,
            opts.trust === "verified_execution" || opts.trust === "operator" ? opts.trust : "untrusted_external",
            opts.origin,
            opts.provenance ?? "",
            now,
            state === "committed" ? now : null
          );
          inserted.push(get(`claim-${hash}`));
        }
      });
      return inserted;
    });
  }
  async function graduate(id) {
    return mutex.run(() => {
      let out = null;
      txn(() => {
        const row = get(id);
        if (row === void 0 || row.state !== "tentative") return;
        db.prepare(`UPDATE claims SET state = 'committed', committed_at = ? WHERE id = ?`).run(Date.now(), id);
        out = get(id) ?? null;
      });
      return out;
    });
  }
  async function confirm(id) {
    const row = get(id);
    if (row === void 0) return null;
    return graduate(id);
  }
  async function rescind(id, reason) {
    return mutex.run(() => {
      let changed = false;
      txn(() => {
        const row = get(id);
        if (row === void 0) return;
        db.prepare(`UPDATE claims SET state = 'rescinded', tombstone_reason = ? WHERE id = ?`).run(reason ?? "", id);
        changed = true;
      });
      return changed;
    });
  }
  async function reconcileBoot() {
    return mutex.run(() => {
      let n = 0;
      txn(() => {
        const res = db.prepare(`UPDATE claims SET state = 'orphaned_cancelled' WHERE state = 'tentative'`).run();
        n = Number(res?.changes ?? 0);
      });
      return n;
    });
  }
  function list(filter) {
    if (filter?.category !== void 0 && filter?.state !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE category = ? AND state = ? ORDER BY created_at DESC`).all(filter.category, filter.state);
    }
    if (filter?.category !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE category = ? ORDER BY created_at DESC`).all(filter.category);
    }
    if (filter?.state !== void 0) {
      return db.prepare(`SELECT * FROM claims WHERE state = ? ORDER BY created_at DESC`).all(filter.state);
    }
    return db.prepare(`SELECT * FROM claims ORDER BY created_at DESC LIMIT 200`).all();
  }
  return { intake, graduate, confirm, rescind, reconcileBoot, list, get, stateOf };
}

// packages/enpoi-context-keeper/src/index.ts
import { join as join2 } from "node:path";
import Schema from "schemastery";
var name = "enpoi-context-keeper";
var inject = ["llm"];
function diag(line) {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? "/tmp";
    const dir = join2(home.endsWith(".dsh") ? home : join2(home, ".dsh"), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join2(dir, "enpoi-keeper.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
var Config = Schema.object({
  provider: Schema.string().default("freellmapi"),
  model: Schema.string().default("auto"),
  fallbackProvider: Schema.string().default("antigravity"),
  fallbackModel: Schema.string().default("gemini-3.7-flash-tiered"),
  debounceMs: Schema.number().default(15e3),
  leaseMs: Schema.number().default(45e3),
  maxInputEvents: Schema.number().default(80),
  maxOutputTokens: Schema.number().default(2048)
});
var SYSTEM_PROMPT = [
  "You are the Enpoi Harness context keeper \u2014 the master background summarizer and architectural keeper for this coding session.",
  "You maintain a running, concise, and highly accurate Living Brief of the session for later dispatch to subagent workers, the Oracle, Council debaters, and permanent memory.",
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
  "You have ONE background tool: memory_save. Use it via the CLAIMS block below.",
  "",
  "Output EXACTLY two blocks, IN THIS ORDER (no other text at all):",
  "",
  "BLOCK 1 \u2014 PROSE:",
  "Use ONLY the relevant section headers from below (omit any section with no substantive content):",
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
  "BLOCK 2 \u2014 CLAIMS:",
  'A line starting with "CLAIMS:" followed by a JSON array of permanent facts you are SAVING to memory.db: [{"fact":"...","category":"ARCHITECTURE","tags":"..."}]',
  "  - File 2\u20134 durable facts about Adam's environment/infrastructure/architecture whenever the session surfaces them.",
  "  - Categories limited to ARCHITECTURE, CONFIG_VALUES, or PROJECT.",
  '  - If no new permanent facts emerged, emit "CLAIMS: []".',
  "  - NO credentials/passwords/tokens/secrets; skip transient chatter."
].join("\n");
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
function apply(ctx, config) {
  const states = /* @__PURE__ */ new Map();
  diag(`apply: mounted (provider=${config.provider}/${config.model}, debounce=${config.debounceMs}ms, lease=${config.leaseMs}ms)`);
  ctx.on("session/event", (session, event) => {
    if (event.type !== "turn/end") return;
    const reason = event.data.reason;
    if (reason.kind === "aborted") return;
    diag(`turn/end: session=${session.id} turn=${event.data.turn} reason=${reason.kind} \u2014 arming`);
    arm(ctx, config, states, session, event.data.turn);
  });
  ctx.on("dispose", () => {
    for (const state of states.values()) {
      if (state.timer !== null) clearTimeout(state.timer);
    }
    states.clear();
  });
}
function arm(ctx, config, states, session, turn) {
  const key = session.id;
  let state = states.get(key);
  if (state === void 0) {
    state = { timer: null, running: false, rerunRequested: false, turn };
    states.set(key, state);
  }
  if (state.timer !== null) clearTimeout(state.timer);
  state.turn = turn;
  state.timer = setTimeout(() => {
    state.timer = null;
    void run(ctx, config, states, session, turn);
  }, config.debounceMs);
}
async function run(ctx, config, states, session, turn) {
  const key = session.id;
  const state = states.get(key);
  if (state === void 0) return;
  state.timer = null;
  if (state.running) {
    state.rerunRequested = true;
    return;
  }
  state.running = true;
  const lease = new AbortController();
  const leaseTimer = setTimeout(() => lease.abort(), config.leaseMs);
  try {
    const input = frameInput(session, config.maxInputEvents);
    if (input.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty input, skipping`);
      return;
    }
    const route = resolveKeeperRoute(ctx, config);
    diag(`run: session=${session.id} turn=${turn} \u2014 calling LLM (input ${input.length} chars, route ${route.provider}/${route.model})`);
    const snapshotSeq = session.events.at(-1)?.seq ?? session.seq;
    const result = await summarize(ctx, config, session, input, lease.signal, route);
    if (result.text.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty summary, skipping`);
      return;
    }
    diag(`run: session=${session.id} turn=${turn} \u2014 raw output: ${result.text.slice(0, 1200).replace(/\n/g, " | ")}`);
    const { prose: rawProse, claims } = splitProseClaims(result.text);
    const prose = cleanKeeperProse(rawProse);
    if (prose.length === 0) {
      diag(`run: session=${session.id} turn=${turn} \u2014 empty or cleaned-empty prose, skipping`);
      return;
    }
    session.append("brief/prose-updated", {
      basedOnSeq: snapshotSeq,
      model: result.route,
      text: prose,
      origin: "context-keeper"
    });
    diag(`run: session=${session.id} turn=${turn} \u2014 appended brief/prose-updated via ${result.route} (${prose.length} chars, ${claims.length} claims)`);
    ctx.logger.info(`enpoi-context-keeper: brief updated for session ${session.id} (turn ${turn})`);
    if (claims.length > 0) {
      try {
        const memDb = openMemoryDb();
        const mem = makePipeline(memDb);
        const inserted = await mem.intake(
          claims.map((c) => ({ fact: c.fact, category: c.category, tags: c.tags })),
          { origin: "keeper", trust: "verified_execution", provenance: JSON.stringify({ sessionId: session.id, turn }) }
        );
        diag(`run: session=${session.id} turn=${turn} \u2014 memory intake: ${inserted.length} claim(s) filed`);
      } catch (err) {
        diag(`run: session=${session.id} turn=${turn} \u2014 memory intake FAILED: ${String(err)}`);
      }
    }
  } catch (error) {
    if (lease.signal.aborted) {
      diag(`run: session=${session.id} turn=${turn} \u2014 KEEPER_TIMEOUT`);
      ctx.logger.warn(`enpoi-context-keeper: KEEPER_TIMEOUT session ${session.id} (turn ${turn})`);
    } else {
      diag(`run: session=${session.id} turn=${turn} \u2014 ERROR ${String(error)}`);
      ctx.logger.warn(`enpoi-context-keeper: ${String(error)} (session ${session.id}, turn ${turn})`);
    }
  } finally {
    clearTimeout(leaseTimer);
    state.running = false;
    if (state.rerunRequested) {
      state.rerunRequested = false;
      state.timer = setTimeout(() => {
        state.timer = null;
        void run(ctx, config, states, session, state.turn);
      }, config.debounceMs);
    }
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
function splitProseClaims(text) {
  const idx = text.indexOf("CLAIMS:");
  if (idx === -1) return { prose: text.trim(), claims: [] };
  const prose = text.slice(0, idx).replace(/^PROSE\s*:/m, "").trim();
  const jsonPart = text.slice(idx + "CLAIMS:".length).trim();
  try {
    const m = jsonPart.match(/\[[\s\S]*\]/);
    if (m === null) return { prose, claims: [] };
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return { prose, claims: [] };
    const claims = arr.filter((c) => typeof c === "object" && c !== null && typeof c.fact === "string").map((c) => ({
      fact: String(c.fact).trim().slice(0, 300),
      category: String(c.category ?? "PROJECT").slice(0, 32),
      tags: typeof c.tags === "string" ? c.tags : void 0
    })).filter((c) => c.fact.length > 0);
    return { prose, claims };
  } catch {
    diag("splitProseClaims: CLAIMS JSON parse failed (isolated, prose kept)");
    return { prose, claims: [] };
  }
}
function frameInput(session, maxEvents) {
  const events = session.events;
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
function validateKeeperOutput(text, finishKind) {
  if (finishKind === "max-tokens") {
    return { valid: false, reason: "Stream truncated by maxOutputTokens limit" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "Empty output received from model" };
  }
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
  return { valid: true };
}
async function summarize(ctx, config, session, input, signal, route) {
  const messages = [createUserMessage({
    content: [{ type: "text", text: input }],
    source: { kind: "plugin", plugin: "enpoi-context-keeper" }
  })];
  const base = {
    provider: route.provider,
    model: route.model,
    messages,
    system: SYSTEM_PROMPT,
    maxTokens: config.maxOutputTokens,
    sessionId: session.id,
    purpose: "context-keeper",
    signal,
    ...route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}
  };
  async function executeRoute(provider, model) {
    const result = await streamTextWithMeta(ctx, { ...base, provider, model });
    const validation = validateKeeperOutput(result.text, result.finishKind);
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
  Config,
  apply,
  arm,
  cleanKeeperProse,
  inject,
  name,
  resolveKeeperRoute,
  run
};
