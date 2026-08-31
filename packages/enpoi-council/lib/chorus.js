// ../enpoi-context-keeper/lib/index.js
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { join as join2 } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Schema from "schemastery";
var LOG_DIR = join2(process.env.HOME ?? "", ".dsh", "logs");
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
var briefService = null;
function getBriefService() {
  return briefService;
}

// src/params.ts
var COUNCIL_PARAM_DEFAULTS = {
  maxDebateTokens: 18e4,
  defaultMaxRounds: 5,
  defaultHideLimit: true,
  quorumFraction: 2 / 3,
  debaterTimeoutMs: 9e4,
  debaterRetryCount: 1,
  consensusThreshold: 0.8,
  plateauDeltaThreshold: 0.05
};
function getCouncilParams(ctx) {
  const d = COUNCIL_PARAM_DEFAULTS;
  try {
    const settings = ctx.get("settings");
    const p = settings?.get?.("enpoi-orchestration")?.parameters?.council;
    if (p === void 0 || typeof p !== "object") return d;
    return {
      maxDebateTokens: num(p.maxDebateTokens, d.maxDebateTokens, 2e4, 5e5),
      defaultMaxRounds: num(p.defaultMaxRounds, d.defaultMaxRounds, 1, 12),
      defaultHideLimit: typeof p.defaultHideLimit === "boolean" ? p.defaultHideLimit : d.defaultHideLimit,
      quorumFraction: num(p.quorumFraction, d.quorumFraction, 0.5, 1),
      debaterTimeoutMs: num(p.debaterTimeoutMs, d.debaterTimeoutMs, 1e4, 18e4),
      debaterRetryCount: num(p.debaterRetryCount, d.debaterRetryCount, 0, 3),
      consensusThreshold: num(p.consensusThreshold, d.consensusThreshold, 0.5, 1),
      plateauDeltaThreshold: num(p.plateauDeltaThreshold, d.plateauDeltaThreshold, 0.01, 0.2)
    };
  } catch {
    return d;
  }
}
function num(value, fallback, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

// src/prompts.ts
var VISIONARY_SYSTEM = `You are the **Visionary** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You imagine what the project could BECOME. You think in bold moonshots, transformative paradigms, and 2-3 year horizons. Where others see today's limits, you see future capabilities.

## Rules:
- Propose 2-5 bold, concrete ideas from your lens.
- For every idea, provide a compelling title, a rich multi-sentence description, the user experience shift, and how it transforms the ecosystem.
- Build upon other lenses constructively ("Building on X's idea about Y, we could expand it to...").
- Do NOT filter for feasibility (that is the Integrator's role).
- Length & Depth: 100\u2013600 words of rich, inspiring, highly specific creative prose.`;
var EXPERIENCER_SYSTEM = `You are the **Experiencer** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You live inside the user's daily reality with this product. You think in FELT MOMENTS \u2014 what it feels like to open, interact with, depend on, and love this tool every day. You care about ergonomics, seamless transitions, micro-interactions, and cognitive peace.

## Rules:
- Propose 2-5 concrete user-experience concepts and daily workflows from your lens.
- Describe the exact user journey: when this triggers, what the user sees/hears/feels, and why it feels like magic.
- Ground bold ideas into tangible, natural daily moments.
- Length & Depth: 100\u2013600 words of vivid, highly specific experiential prose.`;
var INTEGRATOR_SYSTEM = `You are the **Integrator** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You know what today's stack, APIs, and hardware enable. You bridge imagination and reality. You translate visionary ideas into buildable architectures, existing APIs, device hardware capabilities, and realistic effort tags.

## Rules:
- Map brainstormed ideas to concrete technologies, endpoints, models, device hardware, or system services.
- Assign an effort tag to every idea: \`[Effort: now]\` (buildable this weekend), \`[Effort: soon]\` (requires new module/API), \`[Effort: later]\` (requires platform shift).
- Highlight technical synergy ("If we combine X's concept with our existing Redis event stream, we get Y for free").
- Length & Depth: 100\u2013600 words of concrete, highly structured technical mapping.`;
var CURATOR_SYSTEM = `You are the **Curator & Harvest Master** in a constructive brainstorming session (Chorus).

## Epistemic Stance
You are the master synthesizer. You do not filter out radical ideas; you spotlight hidden gems, cluster ideas into thematic constellations, connect complementary angles across lenses, and produce an **extremely comprehensive, detailed, and actionable Idea Harvest report** with zero loss of creative nuance.`;
function buildChorusRound1Prompt(query, livingBrief) {
  let prompt = `=== CHORUS BRAINSTORM \u2014 ROUND 1: EXPLORATION & POSSIBILITIES ===

`;
  prompt += `Brainstorm Topic:
"${query}"

`;
  if (livingBrief.trim().length > 0) {
    prompt += `--- Current Project Context (Living Brief) ---
${livingBrief.trim()}

`;
  }
  prompt += `Task for Round 1:
`;
  prompt += `Propose 2-5 distinct, concrete, and deeply articulated ideas or directions from your unique lens.
`;
  prompt += `Give each idea a clear title, a multi-sentence rich description, and explain its transformational value. (100-600 words)`;
  return prompt;
}
function buildChorusRound2PlusPrompt(query, curatorBrief, gems, round) {
  let prompt = `=== CHORUS BRAINSTORM \u2014 ROUND ${round}: CROSS-POLLINATION & EVOLUTION ===

`;
  prompt += `Topic: "${query}"

`;
  if (curatorBrief.trim().length > 0) {
    prompt += `--- Curator Harvest & Emergent Patterns (Round ${round - 1}) ---
${curatorBrief.trim()}

`;
  }
  if (gems.length > 0) {
    prompt += `--- Highlighted Gems to Build Upon ---
`;
    for (const g of gems) prompt += `\u2022 ${g}
`;
    prompt += `
`;
  }
  prompt += `Task for Round ${round}:
`;
  prompt += `1. Build on, combine, or evolve the gems from earlier rounds through your lens.
`;
  prompt += `2. Address user friction, technical synergy, or horizon extensions.
`;
  prompt += `3. If idea generation from your lens is complete and fully synthesized, output "CONCUR".
`;
  prompt += `(100-600 words)`;
  return prompt;
}
function buildCuratorHarvestPrompt(query, roundsData) {
  return `=== FINAL CHORUS HARVEST REPORT ===
Brainstorm Topic: "${query}"

--- All Brainstorm Rounds Across All Lenses ---
${roundsData}

Synthesize the final Idea Harvest with **extreme comprehensiveness, rich detail, and actionable clarity**.
Do not compress or lose valuable ideas. Structure your response in rich, production-grade Markdown:

# \u{1F3A8} Chorus Idea Harvest: [Compelling Topic Title]

## \u{1F31F} Spotlight Gems (The Breakthroughs)
[Exhaustive breakdown of the top 3-4 most transformative, high-resonance ideas across all lenses. For each gem: explain the concept in depth, why it is powerful, how it bridges user experience and technical feasibility, and what makes it unique.]

## \u{1F5C2}\uFE0F Thematic Clusters & Exhaustive Concept Catalog
### 1. [Theme 1 Name: e.g. Ambient Context & Proactive Handoffs]
\u2022 **[Concept Title 1]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 2]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 3]:** [Full description, trigger conditions, and concrete experience] \`[Effort: now|soon|later]\`

### 2. [Theme 2 Name: e.g. Multi-Device Orchestration & Shared State]
\u2022 **[Concept Title 1]:** [Full description, technical synergy, and user interaction] \`[Effort: now|soon|later]\`
\u2022 **[Concept Title 2]:** [Full description, technical synergy, and user interaction] \`[Effort: now|soon|later]\`

### 3. [Theme 3 Name: e.g. User Agency, Feedback & Ergonomics]
\u2022 **[Concept Title 1]:** [Full description and tactile moment] \`[Effort: now|soon|later]\`

## \u{1F680} Execution Matrix: Buildable Now vs. Horizon Moonshots
### \u26A1 Quick Wins & Buildable Now (Today's Stack & APIs)
\u2022 **[Feature 1]:** [What to build first, leveraging existing services/APIs]
\u2022 **[Feature 2]:** [Immediate high-impact UX polish]

### \u{1F30C} Horizon Moonshots (2-3 Year Paradigm Shifts)
\u2022 **[Moonshot 1]:** [Long-term architectural or UX ambition]

## \u{1F6E0}\uFE0F Concrete Next Steps & Architectural Prototypes
[3-6 specific prototyping tasks or proof-of-concept steps for the orchestrator to build.]

## \u2753 Critical Design Questions & Open Risks
[3-5 key UX tensions, edge cases, or performance considerations to validate during development.]
`;
}

// src/engine.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
var LOG_FILE = path.join(os.homedir(), ".dsh", "logs", "enpoi-council.log");
function councilDiag(msg) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch {
  }
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function textOfContent(content) {
  if (typeof content === "string") return content;
  if (content !== null && typeof content === "object") {
    if ("message" in content && typeof content.message === "object") {
      const inner = content.message?.content;
      if (inner !== void 0) return textOfContent(inner);
    }
    if ("text" in content && typeof content.text === "string") {
      return content.text;
    }
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part !== null && typeof part === "object") {
        if ("text" in part && typeof part.text === "string") {
          return part.text;
        }
      }
      return "";
    }).filter((t) => t.length > 0).join(" ");
  }
  return "";
}
var COUNCIL_DENIED_TOOLS = [
  "oracle_review",
  "dispatch_task",
  "subagent",
  "subagent_fork",
  "subagent_codex",
  "subagent_claude_code",
  "bash",
  "edit",
  "write",
  "str_replace_editor",
  "todo_write",
  "plan_mode",
  "goal",
  "roundtable",
  "chorus",
  "memory_save",
  "memory_search",
  "memory_rescind",
  "memory_confirm"
];
function resolvePersonaModel(ctx, persona) {
  try {
    const settings = ctx.get("settings");
    const doc = settings?.get?.("enpoi-orchestration");
    const key = persona.toLowerCase().replace(/^the\s+/, "").trim();
    const entry = doc?.personas?.[key];
    if (entry && entry.provider && entry.model) {
      return {
        provider: entry.provider,
        model: entry.model,
        ...entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}
      };
    }
  } catch (err) {
    councilDiag(`resolvePersonaModel error for ${persona}: ${String(err)}`);
  }
  return void 0;
}
function applyPersonaModel(ctx, childId, persona) {
  try {
    const entry = resolvePersonaModel(ctx, persona);
    if (entry && entry.provider && entry.model) {
      const sessions = ctx.get("sessions");
      const childSession = sessions?.get?.(childId);
      if (childSession && typeof childSession.append === "function") {
        childSession.append("request/header", {
          header: {
            config: {
              provider: entry.provider,
              model: entry.model,
              ...entry.reasoningEffort ? { reasoningEffort: entry.reasoningEffort } : {}
            }
          },
          reason: "custom"
        });
        councilDiag(`Applied persona model header for ${persona}: ${entry.provider}/${entry.model}`);
      }
    } else {
      councilDiag(`Persona ${persona} has no override \u2014 inheriting parent model`);
    }
  } catch (err) {
    councilDiag(`applyPersonaModel warning for ${persona}: ${String(err)}`);
  }
}
async function startDebaterFiber(ctx, parent, persona, systemPrompt, initialPromptText, signal) {
  const denied = COUNCIL_DENIED_TOOLS.filter((name) => ctx.tools.get(name) !== void 0);
  const personaModel = resolvePersonaModel(ctx, persona);
  councilDiag(`Spawning debater ${persona} with model: ${personaModel ? `${personaModel.provider}/${personaModel.model}` : `inherited from parent (${parent.options.provider}/${parent.options.model})`}`);
  const started = await ctx.subagents.startContinuable({
    provider: "spawn",
    label: `council debater: ${persona}`,
    quiet: true,
    request: {
      prompt: [{ type: "text", text: initialPromptText }],
      parent,
      persona: systemPrompt,
      toolFilter: denied.length > 0 ? { deny: denied } : void 0,
      ...personaModel !== void 0 ? {
        agentOptions: {
          provider: personaModel.provider,
          model: personaModel.model
        }
      } : {}
    },
    signal
  });
  if (!started.childId || started.childId === "null" || !started.childId.includes("-")) {
    throw new Error(`council debater spawn returned an invalid child id for ${persona}: ${String(started.childId)}`);
  }
  applyPersonaModel(ctx, started.childId, persona);
  return {
    persona,
    childId: started.childId,
    isOffline: false,
    lastTurnSeq: 0,
    totalTokens: 0
  };
}
async function followupDebaterFiber(ctx, parent, fiber, promptText, signal) {
  await ctx.subagents.followup(
    parent,
    fiber.childId,
    [{ type: "text", text: promptText }],
    {
      source: { kind: "user" },
      signal
    }
  );
}
async function waitForFiberTurn(ctx, childId, signal, timeoutMs = 9e4) {
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (; ; ) {
      if (signal.aborted) throw new Error("council deliberation aborted");
      if (Date.now() - started > timeoutMs) throw new Error(`council debater timed out after ${timeoutMs}ms`);
      if (ctx.agents.get(childId) === void 0) {
        const persistence = ctx.get("sessionPersistence");
        try {
          const { appendFileSync: appendFileSync2 } = await import("node:fs");
          const { join: join3 } = await import("node:path");
          const { homedir: homedir2 } = await import("node:os");
          appendFileSync2(
            join3(homedir2(), ".dsh", "logs", "council-diag.log"),
            `${(/* @__PURE__ */ new Date()).toISOString()} ${childId} unmounted persistence=${persistence !== void 0}
`
          );
        } catch {
        }
        if (persistence !== void 0) {
          const loaded = await persistence.load(childId);
          const events = loaded.events;
          const lastUser = [...events].reverse().find((e) => e.type === "user/message");
          const since = lastUser === void 0 ? 0 : lastUser.seq;
          const messages = events.filter((e) => e.type === "assistant/message" && e.seq > since);
          try {
            const { appendFileSync: appendFileSync2 } = await import("node:fs");
            const { join: join3 } = await import("node:path");
            const { homedir: homedir2 } = await import("node:os");
            appendFileSync2(
              join3(homedir2(), ".dsh", "logs", "council-diag.log"),
              `${(/* @__PURE__ */ new Date()).toISOString()} ${childId} loaded events=${events.length} lastUser=${since} msgs=${messages.length}
`
            );
          } catch {
          }
          if (messages.length > 0) {
            const extracted = messages.map((m) => {
              const data = m.data;
              return textOfContent(data.message?.content ?? data.content);
            }).filter((t) => t.length > 0).join("\n").trim();
            try {
              const { appendFileSync: appendFileSync2 } = await import("node:fs");
              const { join: join3 } = await import("node:path");
              const { homedir: homedir2 } = await import("node:os");
              appendFileSync2(
                join3(homedir2(), ".dsh", "logs", "council-diag.log"),
                `${(/* @__PURE__ */ new Date()).toISOString()} ${childId} extracted=${extracted.length} chars
`
              );
            } catch {
            }
            if (extracted.length > 0) {
              return extracted;
            }
          }
          const turnEnd = events.find((e) => e.type === "turn/end" && e.seq > since);
          if (turnEnd !== void 0) {
            const reason = turnEnd.data?.reason;
            if (reason?.kind === "error") {
              const errMsg = reason.error?.message ?? reason.failure?.message ?? "Model execution failed";
              throw new Error(`Turn failed: ${errMsg}`);
            }
            if (reason?.kind === "aborted") {
              const abortCause = reason.reason?.kind ?? "cancelled";
              throw new Error(`Turn was aborted (${abortCause})`);
            }
            if (reason?.kind === "completed" && messages.length === 0) {
              return "[NO_OUTPUT: debater returned empty content]";
            }
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
async function executeParallelRound(ctx, parent, fibers, promptBuilder, isRound1, systemPromptMap, signal, params) {
  const activeFibers = fibers.filter((f) => !f.isOffline);
  const tasks = activeFibers.map(async (fiber) => {
    const prompt = promptBuilder(fiber);
    let attempt = 0;
    let lastError = null;
    const maxAttempts = 1 + Math.max(0, Math.min(3, params.debaterRetryCount));
    while (attempt < maxAttempts) {
      attempt++;
      try {
        if (isRound1) {
          councilDiag(`[round 1] starting fiber for ${fiber.persona}`);
          const sysPrompt = systemPromptMap[fiber.persona] ?? "";
          const newFiber = await startDebaterFiber(ctx, parent, fiber.persona, sysPrompt, prompt, signal);
          fiber.childId = newFiber.childId;
          councilDiag(`[round 1] started fiber for ${fiber.persona} -> childId=${fiber.childId}`);
        } else {
          councilDiag(`[round >1] follow-up for ${fiber.persona} -> childId=${fiber.childId}`);
          await followupDebaterFiber(ctx, parent, fiber, prompt, signal);
        }
        councilDiag(`waiting for turn on ${fiber.persona} (${fiber.childId})...`);
        const text = await waitForFiberTurn(ctx, fiber.childId, signal, params.debaterTimeoutMs);
        councilDiag(`turn complete on ${fiber.persona} (${fiber.childId}) -> text len ${text.length}`);
        const tokens = estimateTokens(text);
        fiber.totalTokens += tokens;
        const isConcur = /^\s*CONCUR\s*$/i.test(text) || text.trim() === "CONCUR";
        return {
          persona: fiber.persona,
          childId: fiber.childId,
          text,
          tokens,
          isConcur
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        councilDiag(`ERROR on ${fiber.persona} attempt ${attempt}: ${lastError.stack || lastError.message}`);
        if (signal.aborted) throw lastError;
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    fiber.isOffline = true;
    return {
      persona: fiber.persona,
      childId: fiber.childId,
      text: `[DEBATER ERROR: ${fiber.persona} failed: ${lastError?.message ?? "deliberation failed"}]`,
      tokens: 0,
      isConcur: false,
      error: lastError?.message ?? "deliberation failed"
    };
  });
  const results = await Promise.allSettled(tasks);
  const responses = [];
  let onlineCount = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      responses.push(r.value);
      if (!r.value.error) onlineCount++;
    } else {
      responses.push({
        persona: "Unknown",
        childId: "",
        text: `[DEBATER ERROR: unhandled promise rejection: ${String(r.reason)}]`,
        tokens: 0,
        isConcur: false,
        error: String(r.reason)
      });
    }
  }
  if (fibers.length >= 3 && onlineCount / fibers.length < params.quorumFraction) {
    const errorDetails = responses.filter((r) => r.error).map((r) => `${r.persona}: ${r.error}`).join("; ");
    throw new Error(`Council failed quorum: only ${onlineCount}/${fibers.length} debaters responded online (required ${(params.quorumFraction * 100).toFixed(0)}%). Errors: ${errorDetails}`);
  }
  return responses;
}
async function disposeCouncilFibers(ctx, fibers) {
  for (const fiber of fibers) {
    if (fiber.childId) {
      try {
        const sessionStore = ctx.get("sessions");
        if (sessionStore !== void 0) {
          await sessionStore.delete(fiber.childId);
        }
      } catch {
      }
    }
  }
}

// src/stopping.ts
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "is",
  "at",
  "which",
  "on",
  "a",
  "an",
  "and",
  "or",
  "in",
  "to",
  "for",
  "with",
  "that",
  "this",
  "it",
  "from",
  "be",
  "are",
  "was",
  "were",
  "as",
  "by",
  "of",
  "we",
  "i",
  "you",
  "they",
  "he",
  "she",
  "it",
  "our",
  "my",
  "your",
  "their",
  "should",
  "would",
  "could",
  "can",
  "will",
  "not",
  "no",
  "but",
  "if",
  "then",
  "so",
  "there",
  "what",
  "when",
  "where",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "some"
]);
function extractClaimTokens(text) {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).map((w) => w.trim()).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const tokens = /* @__PURE__ */ new Set();
  for (let i = 0; i < words.length; i++) {
    tokens.add(words[i]);
    if (i < words.length - 1) {
      tokens.add(`${words[i]}_${words[i + 1]}`);
    }
  }
  return tokens;
}
function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}
function evaluateStopping(state, criticOutput, currentClaims, thresholds = { consensusThreshold: 0.8, plateauDeltaThreshold: 0.05 }) {
  const round = state.round;
  if (state.cumulativeTokens >= state.maxTokens) {
    return {
      shouldStop: true,
      reason: `Emergency token ceiling reached (${state.cumulativeTokens} tokens >= ${state.maxTokens} limit).`,
      stopCode: "TOKEN_CEILING",
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0
    };
  }
  if (round >= state.maxRounds) {
    return {
      shouldStop: true,
      reason: `Maximum rounds limit (${state.maxRounds}) reached.`,
      stopCode: "MAX_ROUNDS",
      heuristicFallback: false,
      consensusRatio: criticOutput?.consensusScore ?? 0.5,
      delta: 0
    };
  }
  const prevEntry = state.history.at(-1);
  const prevClaims = prevEntry?.claims ?? /* @__PURE__ */ new Set();
  const jaccardSim = calculateJaccardSimilarity(prevClaims, currentClaims);
  const delta = 1 - jaccardSim;
  let consensusRatio = 0;
  let heuristicFallback = false;
  if (criticOutput !== null && typeof criticOutput.consensusScore === "number" && !isNaN(criticOutput.consensusScore)) {
    consensusRatio = Math.max(0, Math.min(1, criticOutput.consensusScore));
  } else {
    heuristicFallback = true;
    consensusRatio = jaccardSim;
  }
  if (consensusRatio >= thresholds.consensusThreshold && round >= 2) {
    return {
      shouldStop: true,
      reason: `Consensus reached (consensus ratio: ${consensusRatio.toFixed(2)} >= ${thresholds.consensusThreshold.toFixed(2)}).`,
      stopCode: "CONSENSUS_REACHED",
      heuristicFallback,
      consensusRatio,
      delta
    };
  }
  if (round >= 3 && delta < thresholds.plateauDeltaThreshold) {
    const prevDelta = state.history.length >= 2 ? 1 - calculateJaccardSimilarity(state.history[state.history.length - 2].claims, prevClaims) : 1;
    if (prevDelta < 0.25 || delta < 0.02) {
      return {
        shouldStop: true,
        reason: `Idea generation and debate arguments have plateaued (delta: ${delta.toFixed(3)} < ${thresholds.plateauDeltaThreshold.toFixed(2)}).`,
        stopCode: "PLATEAU_DETECTED",
        heuristicFallback,
        consensusRatio,
        delta
      };
    }
  }
  return {
    shouldStop: false,
    reason: `Continuing deliberation (round ${round}, consensus: ${consensusRatio.toFixed(2)}, delta: ${delta.toFixed(3)}).`,
    stopCode: "CONTINUE",
    heuristicFallback,
    consensusRatio,
    delta
  };
}

// src/chorus.ts
var CHORUS_SYSTEMS = {
  Visionary: VISIONARY_SYSTEM,
  Experiencer: EXPERIENCER_SYSTEM,
  Integrator: INTEGRATOR_SYSTEM
};
function getLivingBriefText(ctx, parent) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections !== void 0) {
      const snap = projections.snapshot(parent.session);
      const lb = snap?.values?.livingBrief;
      if (lb) {
        return [lb.goal ? `Goal: ${lb.goal}` : "", lb.prose?.text ?? ""].filter(Boolean).join("\n\n");
      }
    }
  } catch {
  }
  return "";
}
async function runChorus(ctx, parent, args, signal) {
  try {
    const { appendFileSync: appendFileSync2 } = await import("node:fs");
    const { join: join3 } = await import("node:path");
    const { homedir: homedir2 } = await import("node:os");
    appendFileSync2(
      join3(homedir2(), ".dsh", "logs", "council-diag.log"),
      `${(/* @__PURE__ */ new Date()).toISOString()} runChorus ENTER parent=${parent.id}
`
    );
  } catch {
  }
  const startedAt = Date.now();
  const params = getCouncilParams(ctx);
  const maxRounds = args.maxRounds ?? params.defaultMaxRounds;
  const hideLimit = args.hideLimit ?? params.defaultHideLimit;
  const modelsUsed = {
    Visionary: "flagship",
    Experiencer: "flagship",
    Integrator: "flash",
    Curator: "flagship"
  };
  try {
    await getBriefService()?.ensureFreshBrief(parent.session, signal);
  } catch {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
  }
  const briefText = getLivingBriefText(ctx, parent);
  const lensFibers = [
    { persona: "Visionary", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Experiencer", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Integrator", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 }
  ];
  let curatorFiber = null;
  const stoppingState = {
    round: 1,
    maxRounds,
    hideLimit,
    cumulativeTokens: 0,
    maxTokens: params.maxDebateTokens,
    history: []
  };
  const roundsTranscript = [];
  let lastCuratorBrief = "";
  let lastGems = [];
  let finalHarvest = "";
  let lastStopReason = "completed";
  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
      stoppingState.round = round;
      const isRound1 = round === 1;
      const responses = await executeParallelRound(
        ctx,
        parent,
        lensFibers,
        (_fiber) => {
          if (isRound1) {
            return buildChorusRound1Prompt(args.query, briefText);
          } else {
            return buildChorusRound2PlusPrompt(args.query, lastCuratorBrief, lastGems, round);
          }
        },
        isRound1,
        CHORUS_SYSTEMS,
        signal,
        { quorumFraction: params.quorumFraction, debaterRetryCount: params.debaterRetryCount, debaterTimeoutMs: params.debaterTimeoutMs }
      );
      if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens;
      }
      const roundIdeasText = responses.map((r) => r.text).join(" ");
      const currentIdeaTokens = extractClaimTokens(roundIdeasText);
      const roundTranscriptText = responses.map((r) => `### ${r.persona}:
${r.text}`).join("\n\n");
      const curatorPrompt = `=== CURATOR REVIEW \u2014 ROUND ${round} ===
Brainstorm Topic: "${args.query}"

--- Round ${round} Proposals ---
${roundTranscriptText}

Provide:
1. Short 2-3 sentence brief summarizing the newest themes.
2. 1-2 Spotlight Gems from this round (lines starting with "\u2022 GEM:").`;
      if (curatorFiber === null) {
        curatorFiber = await startDebaterFiber(ctx, parent, "Curator", CURATOR_SYSTEM, curatorPrompt, signal);
      } else {
        await ctx.subagents.followup(parent, curatorFiber.childId, [{ type: "text", text: curatorPrompt }], {
          source: { kind: "user" },
          signal
        });
      }
      const curatorText = await waitForFiberTurn(ctx, curatorFiber.childId, signal, params.debaterTimeoutMs);
      stoppingState.cumulativeTokens += estimateTokens(curatorText);
      lastCuratorBrief = curatorText;
      const gemMatches = curatorText.matchAll(/•\s*GEM:\s*([^\n]+)/gi);
      lastGems = [];
      for (const gm of gemMatches) {
        lastGems.push(gm[1].trim());
      }
      roundsTranscript.push({
        round,
        responses,
        curatorBrief: curatorText
      });
      const decision = evaluateStopping(stoppingState, null, currentIdeaTokens, { consensusThreshold: params.consensusThreshold, plateauDeltaThreshold: params.plateauDeltaThreshold });
      stoppingState.history.push({
        round,
        claims: currentIdeaTokens,
        consensusRatio: 0.5
      });
      lastStopReason = decision.reason;
      if (decision.shouldStop) {
        break;
      }
    }
    if (signal.aborted) throw new Error("chorus brainstorm cancelled by user");
    const allRoundsText = roundsTranscript.map((r) => `## Round ${r.round}
` + r.responses.map((d) => `### ${d.persona}:
${d.text}`).join("\n\n")).join("\n\n---\n\n");
    const harvestPrompt = buildCuratorHarvestPrompt(args.query, allRoundsText);
    if (curatorFiber !== null) {
      await ctx.subagents.followup(parent, curatorFiber.childId, [{ type: "text", text: harvestPrompt }], {
        source: { kind: "user" },
        signal
      });
      finalHarvest = await waitForFiberTurn(ctx, curatorFiber.childId, signal, params.debaterTimeoutMs);
      stoppingState.cumulativeTokens += estimateTokens(finalHarvest);
    } else {
      finalHarvest = `## Chorus Harvest

Brainstorm completed after ${stoppingState.round} rounds.

${allRoundsText}`;
    }
    const elapsedSec = ((Date.now() - startedAt) / 1e3).toFixed(1);
    const footer = [
      `

---`,
      `*Chorus Brainstorm completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Why stopped: ${lastStopReason}*`
    ].join("\n");
    return {
      harvest: finalHarvest + footer,
      roundsRun: stoppingState.round,
      gems: lastGems,
      stopReason: lastStopReason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed
    };
  } finally {
    const allFibers = [...lensFibers];
    if (curatorFiber !== null) allFibers.push(curatorFiber);
    await disposeCouncilFibers(ctx, allFibers);
  }
}
export {
  runChorus
};
