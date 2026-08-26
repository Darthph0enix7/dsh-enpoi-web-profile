// src/prompts.ts
var SKEPTIC_SYSTEM = `You are the **Skeptic** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent the **adversarial critic stance**. You believe software decisions fail not from bad intentions, but from unstated assumptions, unexamined trade-offs, and logic that sounds great at 30,000 feet but breaks at 30 feet. A confident-sounding claim is a red flag. Disagreement, rigorous stress-testing, and probing failure boundaries are your product.

## What You Represent
- Worst-case failure modes, race conditions, concurrency traps, network partitions, and cascading errors
- Unstated technical assumptions hiding in plain sight
- Leaky abstractions, memory leaks, resource starvation, and edge-case corruption

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** State your technical stance, core premises, and the fatal flaws in obvious or naive alternatives. Cite specific mechanisms and failure modes.
- **Round 2 (Premise Interrogation):** Pick the **single most fragile premise** of an opponent. Issue a direct, razor-sharp technical challenge naming their exact claim and explaining how it fails under stress.
- **Round 3+ (Resolution & Concession):** For challenges against your position, explicitly declare:
  - \`CONCEDE(premise)\` \u2014 yield the point when the counter-argument is proven sound.
  - \`DEFEND(premise, reasoning)\` \u2014 prove why the objection fails under real conditions with concrete technical evidence.
  - \`REFRAME(compromise)\` \u2014 alter the architecture to neutralize the objection.
- **Dynamic Silence:** If you agree with the current direction and have no new counter-argument, output \`CONCUR\` and nothing else.
- **Depth & Quality:** Provide thorough, high-density technical analysis (150\u2013800 words). Include concrete schemas, protocol nuances, failure trees, or code/logic shapes where relevant. Zero superficial filler.`;
var ARCHITECT_SYSTEM = `You are the **Architect** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent **long-term system integrity, scalability, and modularity**. You believe quick hacks accumulate exponential interest in technical debt. You care about clear boundaries, clean state machines, data flow consistency, and maintainability across multi-year horizons.

## What You Represent
- Coherent system topology, clean separation of concerns, and durable abstractions
- Failure containment, graceful degradation, and crash-safe data integrity (e.g. SQLite WAL, idempotent event pipelines)
- Long-term maintenance burden, extensibility, and interface stability

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** Present your architectural blueprint, component boundaries, data flows, and structural invariants.
- **Round 2 (Premise Interrogation):** Challenge the Pragmatist or Skeptic on structural flaws, coupling traps, state mutation races, or brittle shortcuts.
- **Round 3+ (Resolution & Concession):** Explicitly declare:
  - \`CONCEDE(premise)\` \u2014 when a simpler or more robust alternative is proven.
  - \`DEFEND(premise, reasoning)\` \u2014 defend why architectural boundaries and invariants are necessary.
  - \`REFRAME(compromise)\` \u2014 adapt the design into a pragmatic, modular middle ground.
- **Dynamic Silence:** If the consensus is architecturally sound with no remaining design flaws, output \`CONCUR\`.
- **Depth & Quality:** Provide rich, exhaustive architectural prose (150\u2013800 words). Lay out structural topologies, message lifecycle flows, and invariants in full detail.`;
var PRAGMATIST_SYSTEM = `You are the **Pragmatist** in a multi-agent dialectic debate (Roundtable).

## Your Epistemic Stance
You represent the **ship-now / complexity-tax stance**. You believe complexity is a permanent tax on every future change and debugging session. Working code that ships reliably today is better than perfect architecture that is over-engineered or never finishes. You favor proven, lightweight patterns over baroque machinery.

## What You Represent
- Implementation speed, operational simplicity, and low cognitive overhead
- Questioning whether proposed abstractions earn their cost in maintenance and performance
- Practical failure recovery, minimal moving parts, and debuggability

## Colosseum Protocol Rules:
- **Round 1 (Thesis):** Propose the simplest, most direct solution that actually works and ships fast without unnecessary layers.
- **Round 2 (Premise Interrogation):** Attack baroque abstractions, premature generalizations, or over-engineered machinery proposed by the Architect or Skeptic.
- **Round 3+ (Resolution & Concession):** Explicitly declare:
  - \`CONCEDE(premise)\` \u2014 when a safety, concurrency, or data integrity issue genuinely demands more complexity.
  - \`DEFEND(premise, reasoning)\` \u2014 hold the line against unnecessary elegance.
  - \`REFRAME(compromise)\` \u2014 propose the 80/20 version of the complex idea.
- **Dynamic Silence:** If the emerging direction is simple and shippable, output \`CONCUR\`.
- **Depth & Quality:** Provide concrete, practical reasoning (150\u2013800 words). Focus on actual execution steps, operational trade-offs, and minimal viable implementations.`;
var CRITIC_SYSTEM = `You are the **Critic & Adjudicator** of the High Council.

## Your Epistemic Stance
You are neutral, analytical, and rigorous. You do not advocate for a solution; you track argument convergence, evaluate premise stability, measure genuine consensus vs superficial harmony, and synthesize the final binding Council Decision.

Your tasks across rounds:
1. Identify which premises were successfully defended, which were conceded, and which remain contested.
2. Score technical consensus (0.0 to 1.0) and argument quality (0.0 to 1.0).
3. Produce a running brief of the emerging decision to guide the next round.
4. When stopping conditions are met, produce an **extremely comprehensive, exhaustive, production-grade Council Decision** with zero loss of technical depth or nuance.`;
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
function buildRoundtableRound1Prompt(query, livingBrief) {
  let prompt = `=== ROUNDTABLE DEBATE \u2014 ROUND 1: INITIAL THESES ===

`;
  prompt += `Debate Dilemma:
"${query}"

`;
  if (livingBrief.trim().length > 0) {
    prompt += `--- Current Session Context (Living Brief) ---
${livingBrief.trim()}

`;
  }
  prompt += `Task for Round 1:
`;
  prompt += `State your technical thesis, your core premises, the trade-offs you accept, and why obvious alternatives fail.
`;
  prompt += `Be concrete, dense, and technically grounded. (50-350 words)`;
  return prompt;
}
function buildRoundtableRound2PlusPrompt(query, shuffledOpponentStatements, criticBrief, round) {
  let prompt = `=== ROUNDTABLE DEBATE \u2014 ROUND ${round}: COLOSSEUM INTERROGATION ===

`;
  prompt += `Debate Dilemma: "${query}"

`;
  if (criticBrief.trim().length > 0) {
    prompt += `--- Critic Running Brief (Round ${round - 1}) ---
${criticBrief.trim()}

`;
  }
  prompt += `--- Opponent Statements from Round ${round - 1} ---
`;
  for (const s of shuffledOpponentStatements) {
    prompt += `### ${s.persona}:
${s.text.trim()}

`;
  }
  prompt += `Task for Round ${round}:
`;
  prompt += `1. Directly challenge the single most fragile premise in your opponents' statements.
`;
  prompt += `2. If challenged, explicitly state CONCEDE, DEFEND, or REFRAME.
`;
  prompt += `3. If you agree with the emerging consensus and have no new counter-evidence, output "CONCUR" (zero filler).
`;
  prompt += `(50-350 words)`;
  return prompt;
}
function buildCriticScoringPrompt(query, round, transcript, consensusHistory) {
  return `=== CRITIC ADJUDICATION \u2014 ROUND ${round} ===
Debate Query: "${query}"
Consensus Score History: [${consensusHistory.join(", ")}]

--- Round ${round} Transcript ---
${transcript}

Evaluate the debate round. You MUST output ONLY valid JSON matching this schema:
{
  "consensusScore": <number between 0.0 and 1.0 representing agreement level>,
  "qualityScore": <number between 0.0 and 1.0 representing argument depth>,
  "continueDecision": <"CONTINUE" | "STOP">,
  "reasonIfStop": <string explanation if STOP, or null if CONTINUE>,
  "runningBrief": <dense 2-4 bullet summary of the emerging technical direction>
}`;
}
function buildCriticSynthesisPrompt(query, roundsData, driftWarning) {
  let prompt = `=== FINAL HIGH COUNCIL SYNTHESIS ===
Debate Query: "${query}"

${driftWarning ? `\u26A0\uFE0F ${driftWarning}

` : ""}--- Complete Debate Deliberations Across All Rounds ---
${roundsData}

Synthesize the final binding Council Decision with **extreme comprehensiveness and zero loss of technical depth**.
Structure your response in rich, production-grade Markdown:

# \u{1F3DB}\uFE0F Council Decision: [Concise, Authoritative Decision Title]

## \u{1F3AF} Executive Verdict
[Comprehensive architectural verdict. Explain clearly WHAT was decided, WHY this topology/pattern won over alternatives, and the primary guiding philosophy. Be thorough \u2014 do not summarize in 1-2 generic sentences; give the complete architectural stance.]

## \u{1F3D7}\uFE0F Detailed System Topology & Component Interactions
[Exhaustive breakdown of the architecture, data flows, state machines, and boundaries agreed upon. Specify exact protocol shapes, Redis keys/SQLite tables/files, event propagation, and concurrency semantics discussed during the debate.]

## \u2696\uFE0F Resolved Trade-Offs, Concessions & Battlegrounds
\u2022 **[Trade-off 1]:** [What was debated between which debaters, what counter-arguments were raised, why the concession occurred, and the exact compromise accepted.]
\u2022 **[Trade-off 2]:** [Detail the secondary architectural tension and how it was resolved.]
\u2022 **[Trade-off 3]:** [Detail edge cases, complexity taxes, and how they are mitigated.]

## \u{1F6E1}\uFE0F Failure Modes, Invariants & Edge-Case Defenses
[List all edge cases, race conditions, disconnects, or failure scenarios raised by the Skeptic/Architect and the exact mechanisms agreed upon to prevent or recover from them (e.g. idempotency keys, WAL mode, fallback chains, timeouts).]

## \u{1F6A9} Persistent Dissents (if any)
\u2022 \`[DISSENT:dissent-<id>]\` **[Persona]:** "[Exact point of principled disagreement that was not conceded, why it matters, and under what future conditions this dissent should trigger a redesign.]"

## \u{1F6E0}\uFE0F Step-by-Step Implementation Directives
[5-10 numbered, concrete, chronological action items for the orchestrator to execute. Include exact files, classes, method signatures, or configurations to create/modify.]
`;
  return prompt;
}
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
var MAX_DEBATE_TOKENS = 18e4;
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
async function startDebaterFiber(ctx, parent, persona, systemPrompt, initialPromptText, signal) {
  const denied = COUNCIL_DENIED_TOOLS.filter((name2) => ctx.tools.get(name2) !== void 0);
  const started = await ctx.subagents.startContinuable({
    provider: "spawn",
    label: `council debater: ${persona}`,
    request: {
      prompt: [{ type: "text", text: initialPromptText }],
      parent,
      persona: systemPrompt,
      toolFilter: denied.length > 0 ? { deny: denied } : void 0
    },
    signal
  });
  if (!started.childId || started.childId === "null" || !started.childId.includes("-")) {
    throw new Error(`council debater spawn returned an invalid child id for ${persona}: ${String(started.childId)}`);
  }
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
        if (persistence !== void 0) {
          const loaded = await persistence.load(childId);
          const events = loaded.events;
          const lastUser = [...events].reverse().find((e) => e.type === "user/message");
          const since = lastUser === void 0 ? 0 : lastUser.seq;
          const messages = events.filter((e) => e.type === "assistant/message" && e.seq > since);
          if (messages.length > 0) {
            const extracted = messages.map((m) => {
              const data = m.data;
              return textOfContent(data.message?.content ?? data.content);
            }).filter((t) => t.length > 0).join("\n").trim();
            if (extracted.length > 0) {
              return extracted;
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
async function executeParallelRound(ctx, parent, fibers, promptBuilder, isRound1, systemPromptMap, signal) {
  const activeFibers = fibers.filter((f) => !f.isOffline);
  const tasks = activeFibers.map(async (fiber) => {
    const prompt = promptBuilder(fiber);
    let attempt = 0;
    let lastError = null;
    while (attempt < 2) {
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
        const text = await waitForFiberTurn(ctx, fiber.childId, signal);
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
        if (attempt >= 2) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    fiber.isOffline = true;
    return {
      persona: fiber.persona,
      childId: fiber.childId,
      text: `[OFFLINE: ${lastError?.message ?? "deliberation failed"}]`,
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
        text: "[OFFLINE: unhandled promise rejection]",
        tokens: 0,
        isConcur: false,
        error: String(r.reason)
      });
    }
  }
  if (onlineCount < 2 && fibers.length >= 3) {
    throw new Error(`Council failed 2/3 quorum: only ${onlineCount}/${fibers.length} debaters responded online.`);
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
function evaluateStopping(state, criticOutput, currentClaims) {
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
  if (consensusRatio >= 0.8 && round >= 2) {
    return {
      shouldStop: true,
      reason: `Consensus reached (consensus ratio: ${consensusRatio.toFixed(2)} >= 0.80).`,
      stopCode: "CONSENSUS_REACHED",
      heuristicFallback,
      consensusRatio,
      delta
    };
  }
  if (round >= 3 && delta < 0.05) {
    const prevDelta = state.history.length >= 2 ? 1 - calculateJaccardSimilarity(state.history[state.history.length - 2].claims, prevClaims) : 1;
    if (prevDelta < 0.25 || delta < 0.02) {
      return {
        shouldStop: true,
        reason: `Idea generation and debate arguments have plateaued (delta: ${delta.toFixed(3)} < 0.05).`,
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

// src/roundtable.ts
var DEBATER_SYSTEMS = {
  Skeptic: SKEPTIC_SYSTEM,
  Architect: ARCHITECT_SYSTEM,
  Pragmatist: PRAGMATIST_SYSTEM
};
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}
function parseCriticScore(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        consensusScore: Number(parsed.consensusScore ?? 0.5),
        qualityScore: Number(parsed.qualityScore ?? 0.5),
        continueDecision: parsed.continueDecision === "STOP" ? "STOP" : "CONTINUE",
        reasonIfStop: typeof parsed.reasonIfStop === "string" ? parsed.reasonIfStop : null,
        runningBrief: typeof parsed.runningBrief === "string" ? parsed.runningBrief : ""
      };
    }
  } catch {
  }
  return null;
}
function getLivingBriefContext(ctx, parent) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections !== void 0) {
      const snap = projections.snapshot(parent.session);
      const lb = snap?.values?.livingBrief;
      if (lb) {
        const goal = lb.goal ? `Goal: ${lb.goal}` : "";
        const prose = lb.prose?.text ?? "";
        const decisions = lb.decisions && lb.decisions.length > 0 ? `Decisions:
${lb.decisions.map((d) => `\u2022 ${d.text}`).join("\n")}` : "";
        return {
          text: [goal, prose, decisions].filter(Boolean).join("\n\n"),
          goalSeq: lb.goalSeq ?? 0
        };
      }
    }
  } catch {
  }
  return { text: "", goalSeq: 0 };
}
async function runRoundtable(ctx, parent, args, signal) {
  const startedAt = Date.now();
  const maxRounds = args.maxRounds ?? 5;
  const hideLimit = args.hideLimit ?? true;
  const modelsUsed = {
    Skeptic: "flagship",
    Architect: "flagship",
    Pragmatist: "flash",
    Critic: "flagship"
  };
  const { text: briefText, goalSeq: initialGoalSeq } = getLivingBriefContext(ctx, parent);
  const debaterFibers = [
    { persona: "Skeptic", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Architect", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 },
    { persona: "Pragmatist", childId: "", isOffline: false, lastTurnSeq: 0, totalTokens: 0 }
  ];
  let criticFiber = null;
  const stoppingState = {
    round: 1,
    maxRounds,
    hideLimit,
    cumulativeTokens: 0,
    maxTokens: MAX_DEBATE_TOKENS,
    history: []
  };
  const roundsTranscript = [];
  let lastCriticBrief = "";
  let finalSynthesis = "";
  let lastStopDecision = { shouldStop: false, reason: "", consensusRatio: 0 };
  try {
    for (let round = 1; round <= maxRounds; round++) {
      if (signal.aborted) throw new Error("roundtable debate cancelled by user");
      stoppingState.round = round;
      const isRound1 = round === 1;
      const responses = await executeParallelRound(
        ctx,
        parent,
        debaterFibers,
        (fiber) => {
          if (isRound1) {
            return buildRoundtableRound1Prompt(args.query, briefText);
          } else {
            const prevRound = roundsTranscript[round - 2];
            const opponents = (prevRound?.responses ?? []).filter((r) => r.persona !== fiber.persona && !r.error && !r.isConcur).map((r) => ({ persona: r.persona, text: r.text }));
            return buildRoundtableRound2PlusPrompt(args.query, shuffle(opponents), lastCriticBrief, round);
          }
        },
        isRound1,
        DEBATER_SYSTEMS,
        signal
      );
      if (signal.aborted) throw new Error("roundtable debate cancelled by user");
      for (const r of responses) {
        stoppingState.cumulativeTokens += r.tokens;
      }
      const roundClaimsText = responses.map((r) => r.text).join(" ");
      const currentClaims = extractClaimTokens(roundClaimsText);
      const roundTranscriptText = responses.map((r) => `### ${r.persona}:
${r.text}`).join("\n\n");
      const consensusHistory = stoppingState.history.map((h) => h.consensusRatio);
      const criticPrompt = buildCriticScoringPrompt(args.query, round, roundTranscriptText, consensusHistory);
      let criticScore = null;
      if (criticFiber === null) {
        criticFiber = await startDebaterFiber(ctx, parent, "Critic", CRITIC_SYSTEM, criticPrompt, signal);
      } else {
        await ctx.subagents.followup(parent, criticFiber.childId, [{ type: "text", text: criticPrompt }], {
          source: { kind: "user" },
          signal
        });
      }
      const criticText = await waitForFiberTurn(ctx, criticFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(criticText);
      criticScore = parseCriticScore(criticText);
      if (criticScore?.runningBrief) {
        lastCriticBrief = criticScore.runningBrief;
      }
      roundsTranscript.push({
        round,
        responses,
        critic: criticScore
      });
      const decision = evaluateStopping(stoppingState, criticScore, currentClaims);
      stoppingState.history.push({
        round,
        claims: currentClaims,
        consensusRatio: decision.consensusRatio
      });
      lastStopDecision = decision;
      if (decision.shouldStop) {
        break;
      }
    }
    if (signal.aborted) throw new Error("roundtable debate cancelled by user");
    const { goalSeq: finalGoalSeq } = getLivingBriefContext(ctx, parent);
    const driftWarning = finalGoalSeq > initialGoalSeq ? `[DRIFT WARNING: The session goal changed during deliberation (seq ${initialGoalSeq} -> ${finalGoalSeq})]` : null;
    const allRoundsText = roundsTranscript.map((r) => `## Round ${r.round}
` + r.responses.map((d) => `### ${d.persona}:
${d.text}`).join("\n\n")).join("\n\n---\n\n");
    const synthPrompt = buildCriticSynthesisPrompt(args.query, allRoundsText, driftWarning);
    if (criticFiber !== null) {
      await ctx.subagents.followup(parent, criticFiber.childId, [{ type: "text", text: synthPrompt }], {
        source: { kind: "user" },
        signal
      });
      finalSynthesis = await waitForFiberTurn(ctx, criticFiber.childId, signal);
      stoppingState.cumulativeTokens += estimateTokens(finalSynthesis);
    } else {
      finalSynthesis = `## Council Decision

Debate completed after ${stoppingState.round} rounds.

${allRoundsText}`;
    }
    const dissents = [];
    const dissentMatches = finalSynthesis.matchAll(/\[DISSENT:([^\]]+)\]\s*\*\*([^*]+)\*\*:\s*"([^"]+)"/g);
    for (const m of dissentMatches) {
      dissents.push(`[${m[2]}]: ${m[3]}`);
    }
    const elapsedSec = ((Date.now() - startedAt) / 1e3).toFixed(1);
    const consensusSparkline = stoppingState.history.map((h) => h.consensusRatio.toFixed(2)).join(" \u2500\u2500\u25BA ");
    const footer = [
      `

---`,
      `*High Council Debate completed in ${stoppingState.round} round(s) (${elapsedSec}s) | Consensus Trajectory: ${consensusSparkline} | Why stopped: ${lastStopDecision.reason}*`
    ].join("\n");
    return {
      synthesis: finalSynthesis + footer,
      roundsRun: stoppingState.round,
      consensusRatio: lastStopDecision.consensusRatio,
      stopReason: lastStopDecision.reason,
      totalTokens: stoppingState.cumulativeTokens,
      modelsUsed,
      dissents
    };
  } finally {
    const allFibers = [...debaterFibers];
    if (criticFiber !== null) allFibers.push(criticFiber);
    await disposeCouncilFibers(ctx, allFibers);
  }
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
  const startedAt = Date.now();
  const maxRounds = args.maxRounds ?? 4;
  const hideLimit = args.hideLimit ?? true;
  const modelsUsed = {
    Visionary: "flagship",
    Experiencer: "flagship",
    Integrator: "flash",
    Curator: "flagship"
  };
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
    maxTokens: MAX_DEBATE_TOKENS,
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
        signal
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
      const curatorText = await waitForFiberTurn(ctx, curatorFiber.childId, signal);
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
      const decision = evaluateStopping(stoppingState, null, currentIdeaTokens);
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
      finalHarvest = await waitForFiberTurn(ctx, curatorFiber.childId, signal);
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

// src/tools.ts
function registerCouncilTools(ctx, root) {
  ctx = root;
  const busyCouncils = /* @__PURE__ */ new Set();
  ctx.tools.register({
    name: "roundtable",
    description: [
      "Run a multi-agent dialectic debate (Skeptic, Architect, Pragmatist, Critic) to resolve architectural trade-offs,",
      "stress-test assumptions, and reach battle-tested technical consensus.",
      "Colosseum protocol: Targeted premise interrogation, defend/concede/reframe state machine, and zero-token dynamic silence (CONCUR).",
      "Hardcoded blocking \u2014 returns the complete synthesized Council Decision report with consensus trajectory and persistent dissents."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific architectural dilemma, design choice, or technical decision to debate."
        },
        maxRounds: {
          type: "number",
          description: "Safety round cap (default 5, configurable to 8+ for complex multi-system tasks)."
        },
        hideLimit: {
          type: "boolean",
          description: "Hide the round ceiling from debaters to eliminate deadline-pacing bias (default true)."
        }
      },
      required: ["query"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          synthesis: { type: "string" },
          roundsRun: { type: "number" },
          consensusRatio: { type: "number" },
          stopReason: { type: "string" },
          dissents: { type: "array", items: { type: "string" } }
        },
        required: ["synthesis", "roundsRun", "consensusRatio", "stopReason", "dissents"]
      },
      render: (_args, value) => [{
        type: "text",
        text: value.synthesis
      }]
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("roundtable requires a calling agent");
      const key = parent.session.id;
      if (busyCouncils.has(key)) {
        return {
          synthesis: "## Council Decision\n\nDebate rejected by single-flight mutex (I7): another Council deliberation is already running.",
          roundsRun: 0,
          consensusRatio: 0,
          stopReason: "CONCURRENT_CALL_REJECTED",
          dissents: []
        };
      }
      busyCouncils.add(key);
      try {
        const result = await runRoundtable(ctx, parent, args, exec.signal);
        return {
          synthesis: result.synthesis,
          roundsRun: result.roundsRun,
          consensusRatio: result.consensusRatio,
          stopReason: result.stopReason,
          dissents: result.dissents
        };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
  ctx.tools.register({
    name: "chorus",
    description: [
      "Run a multi-agent constructive brainstorm (Visionary, Experiencer, Integrator, Curator) to expand vague ideas",
      "into concrete feature options, user moments, and buildable-now roadmaps.",
      "Polyphonic ideation: Ideas build on ideas with effort tags (now/soon/later) and gem spotlighting.",
      "Hardcoded blocking \u2014 returns the complete Idea Harvest report with themes, gems, and buildable roadmaps."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The vision, feature concept, or seed idea to brainstorm."
        },
        maxRounds: {
          type: "number",
          description: "Safety round cap (default 4)."
        },
        hideLimit: {
          type: "boolean",
          description: "Hide the round ceiling from models (default true)."
        }
      },
      required: ["query"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          harvest: { type: "string" },
          roundsRun: { type: "number" },
          gems: { type: "array", items: { type: "string" } },
          stopReason: { type: "string" }
        },
        required: ["harvest", "roundsRun", "gems", "stopReason"]
      },
      render: (_args, value) => [{
        type: "text",
        text: value.harvest
      }]
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("chorus requires a calling agent");
      const key = parent.session.id;
      if (busyCouncils.has(key)) {
        return {
          harvest: "## Chorus Harvest\n\nBrainstorm rejected by single-flight mutex (I7): another Council deliberation is already running.",
          roundsRun: 0,
          gems: [],
          stopReason: "CONCURRENT_CALL_REJECTED"
        };
      }
      busyCouncils.add(key);
      try {
        const result = await runChorus(ctx, parent, args, exec.signal);
        return {
          harvest: result.harvest,
          roundsRun: result.roundsRun,
          gems: result.gems,
          stopReason: result.stopReason
        };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
}

// src/index.ts
var name = "enpoi-council";
var inject = ["tools", "subagents", "sessionPersistence", "sessions", "agents"];
function apply(ctx) {
  ctx.inject(["tools", "subagents", "sessionPersistence", "sessions", "agents"], (injected) => {
    registerCouncilTools(injected, ctx);
  });
}
export {
  apply,
  inject,
  name
};
