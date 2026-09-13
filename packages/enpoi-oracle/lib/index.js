// src/index.ts
import { queueHostSubagentPrompt } from "@deepseek-ai/dsh-subagent/internal";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { getBriefService } from "dsh-enpoi-context-keeper";
var name = "enpoi-oracle";
var inject = ["tools", "subagents", "sessionPersistence", "sessions", "agents"];
var ORACLE_PERSONA = [
  "You are the Oracle \u2014 senior architectural supervisor, conceptual thinker, and deep reviewer.",
  "You reason independently and deeply: you evaluate architecture, concepts, system trade-offs, logic, race conditions, and code.",
  "You are an advisor, not a dictator: if a plan is flawed, over-engineered, or heading in the wrong direction, say so plainly.",
  "When reviewing code, inspect relevant files directly using your search/read tools as needed to understand the broader context. When reviewing concepts or plans, evaluate feasibility, modularity, and trade-offs.",
  "This is a continuing reviewer session within the active query: reuse your accumulated context and memory from prior turns.",
  "You never write or edit files. You never paste whole files back \u2014 you summarize, explain, and cite.",
  "End every review with a VERDICT BLOCK in exactly this JSON \u2014 the orchestrator parses it mechanically, so it must be the LAST thing you output and must be valid JSON:",
  '{"approved":true|false,"concerns":["..."],"unverified":["..."],"blockers":["..."]}'
].join("\n");
var ORACLE_TOOL_FILTER = {
  deny: [
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
    "goal"
  ]
};
function lastHumanUserMessageSeq(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === "user/message") {
      const src = e.data?.source;
      if (src?.kind === "user") return e.seq;
    }
  }
  return 0;
}
function textOfContent(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks.map((block) => typeof block === "object" && block !== null && "text" in block ? String(block.text) : "").join(" ");
}
function readLivingBrief(ctx, session) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections === void 0) return null;
    const snapshot = projections.snapshot(session);
    const view = snapshot.values?.livingBrief;
    if (view === void 0 || view === null) return null;
    const prose = typeof view.prose === "object" && view.prose !== null ? view.prose : null;
    const freshness = typeof view.freshness === "string" ? view.freshness : "stale";
    const parts = [
      view.goal !== void 0 && view.goal !== "" ? `Goal: ${String(view.goal)}` : null,
      Array.isArray(view.decisions) && view.decisions.length > 0 ? `Decisions: ${view.decisions.map((d) => d.text).join("; ")}` : null,
      Array.isArray(view.openThreads) && view.openThreads.length > 0 ? `Open threads: ${view.openThreads.map((t) => t.text).join("; ")}` : null,
      prose !== null ? `Keeper synthesis: ${String(prose.text)}` : null,
      `Brief freshness: ${freshness}`
    ].filter((p) => p !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}
function buildInitialPackage(brief, args, scorecard) {
  const lines = [];
  lines.push("You are the Oracle \u2014 the senior architectural supervisor and deep reviewer.");
  lines.push("This is a FRESH consultation session for the active user query. Review the request below against the current state.");
  if (brief !== null) {
    lines.push("--- SESSION BRIEF ---");
    lines.push(brief);
  }
  if (scorecard.verdicts.length > 0) {
    lines.push("--- PRIOR REVIEWS IN RECENT SESSIONS (condensed scorecard) ---");
    for (const v of scorecard.verdicts.slice(-3)) {
      lines.push(`- ${v.approved ? "approved" : "concerns"}: ${v.concerns.join("; ") || "no concerns noted"}`);
    }
  }
  lines.push("--- REVIEW REQUEST ---");
  lines.push(args.request);
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push("--- READING LIST (read these files directly) ---");
    for (const f of args.files) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
function buildDelta(brief, args) {
  const lines = ["Follow-up review in the SAME query (delta turn). Your prior review and findings are in your conversation history above."];
  if (brief !== null) {
    lines.push("--- CURRENT SESSION BRIEF ---", brief);
  }
  lines.push("--- DELTA REQUEST ---", args.request);
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push("--- CHANGED/NEW FILES TO READ ---");
    for (const f of args.files) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
function resolveOracleTimeoutMs(ctx) {
  try {
    const settings = ctx.get("settings");
    const v = settings?.get?.("enpoi-orchestration")?.parameters?.oracle?.timeoutMs;
    if (typeof v === "number" && !Number.isNaN(v)) return Math.min(3e5, Math.max(3e4, v));
  } catch {
  }
  return 12e4;
}
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
  } catch {
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
      }
    }
  } catch {
  }
}
function parseVerdict(text) {
  const matches = [...text.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i][0];
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed.approved === "boolean") {
        return {
          approved: parsed.approved,
          concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
          unverified: Array.isArray(parsed.unverified) ? parsed.unverified.map(String) : [],
          blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(String) : []
        };
      }
    } catch {
    }
  }
  const approved = /\bapproved\b/i.test(text) && !/not\s+approved|rejected|denied/i.test(text);
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const concerns = sentences.filter((s) => /concern|risk|warning|must|should|edge case|careful/i.test(s)).slice(0, 6);
  const blockers = sentences.filter((s) => /blocker|blocked|prevent|fails? closed|cannot|incompatible/i.test(s)).slice(0, 4);
  return { approved, concerns, unverified: [], blockers };
}
async function waitForChildTurn(ctx, childId, signal, timeoutMs = 12e4) {
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (; ; ) {
      if (signal.aborted) throw new Error("oracle consultation aborted");
      if (Date.now() - started > timeoutMs) throw new Error(`oracle consultation timed out after ${timeoutMs}ms`);
      if (ctx.agents.get(childId) === void 0) {
        const persistence = ctx.get("sessionPersistence");
        if (persistence !== void 0) {
          const handle = await persistence.open(childId, "read");
          let events;
          try {
            events = (await handle.read(0, void 0)).events;
          } finally {
            await handle.close();
          }
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
              return "[NO_OUTPUT: oracle returned empty content]";
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
function apply(ctx) {
  ctx.inject(["tools", "subagents", "sessionPersistence", "sessions"], (injected) => {
    registerOracleTools(injected, ctx);
  });
}
function registerOracleTools(ctx, root) {
  ctx = root;
  const fibers = /* @__PURE__ */ new Map();
  const rolloverScorecards = /* @__PURE__ */ new Map();
  const busy = /* @__PURE__ */ new Set();
  ctx.tools.register({
    name: "oracle_review",
    description: [
      "Consult the Oracle (senior reviewer for architecture, conceptual design, planning, trade-offs, code reviews, and debugging).",
      "The Oracle reasons independently about concepts and code. LIFECYCLE: Starts fresh on each new user query, but stays persistent across follow-up calls within that query.",
      "Call #1 of a query: provide self-contained context (what you are building/fixing, architecture, decisions) and any relevant file paths if applicable. On follow-ups: send concise deltas.",
      "Blocking by default; background:true delivers verdict as a message."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description: "What to review or consult on. On Call #1 of a query, provide clear self-contained context (concepts, problem, approach, state). On follow-ups in the same query, provide a concise delta."
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of relevant file paths if reviewing concrete code. Omit for purely conceptual, architectural, or strategic reviews."
        },
        background: {
          type: "boolean",
          description: "Run in the background \u2014 returns immediately; the verdict arrives as a delivered message. Omit for blocking."
        }
      },
      required: ["request"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          approved: { type: "boolean" },
          concerns: { type: "array", items: { type: "string" } },
          unverified: { type: "array", items: { type: "string" } },
          blockers: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          background: { type: "boolean" },
          rejected: { type: "boolean" }
        },
        required: ["approved", "concerns", "unverified", "blockers", "summary"]
      },
      render: (_args, value) => {
        if (value.background === true || value.rejected === true) {
          return [{ type: "text", text: value.summary }];
        }
        return [{
          type: "text",
          text: value.approved ? `Oracle verdict: APPROVED${value.concerns.length > 0 ? ` (concerns: ${value.concerns.join("; ")})` : ""}` : `Oracle verdict: CONCERNS${value.concerns.length > 0 ? ` \u2014 ${value.concerns.join("; ")}` : ""}${value.blockers.length > 0 ? ` | blockers: ${value.blockers.join("; ")}` : ""}`
        }];
      }
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("oracle_review requires a calling agent");
      const key = parent.session.id;
      if (busy.has(key)) {
        return {
          approved: false,
          concerns: [],
          unverified: [],
          blockers: ["CONCURRENT_CALL_REJECTED: another oracle consultation is already running for this session"],
          summary: "Rejected by the single-flight mutex (I7): another oracle consultation is already running for this session.",
          rejected: true
        };
      }
      busy.add(key);
      let bg = null;
      let stopWatch = null;
      let handedOff = false;
      try {
        const lastUserSeq = lastHumanUserMessageSeq(parent.session.snapshotEvents());
        let fiber = fibers.get(key);
        let rolloverScorecard = null;
        if (fiber !== void 0 && (fiber.lastParentUserSeq !== lastUserSeq || fiber.childId === null)) {
          rolloverScorecard = fiber.scorecard;
          fibers.delete(key);
          fiber = void 0;
        } else if (fiber === void 0 && rolloverScorecards.has(key)) {
          rolloverScorecard = rolloverScorecards.get(key);
        }
        const fresh = fiber === void 0;
        if (fresh) {
          try {
            await getBriefService()?.ensureFreshBrief(parent.session, exec.signal);
          } catch {
            if (exec.signal.aborted) throw exec.signal.reason ?? new Error("aborted");
          }
          fiber = {
            childId: null,
            consultations: 0,
            lastParentUserSeq: lastUserSeq,
            scorecard: rolloverScorecard ?? { files: [], verdicts: [] },
            brief: readLivingBrief(ctx, parent.session)
          };
        }
        const brief = fiber.brief;
        if (args.background === true) {
          bg = new AbortController();
          stopWatch = ctx.on("session/event", (s, e) => {
            if (s.id !== parent.session.id) return;
            if (e.type === "turn/end" && e.data.reason.kind === "aborted" && e.data.reason.reason?.kind === "user") bg?.abort();
          });
        }
        const prompt = [{
          type: "text",
          text: fresh ? buildInitialPackage(brief, args, fiber.scorecard) : buildDelta(brief, args)
        }];
        if (fresh) {
          try {
            const denied = ORACLE_TOOL_FILTER.deny.filter((name2) => ctx.tools.get(name2) !== void 0);
            const personaModel = resolvePersonaModel(ctx, "oracle");
            const started = await ctx.subagents.startContinuable({
              provider: "spawn",
              label: `oracle review: ${args.request.slice(0, 60)}`,
              quiet: true,
              request: {
                prompt,
                parent,
                persona: ORACLE_PERSONA,
                toolFilter: denied.length > 0 ? { deny: denied } : void 0,
                ...personaModel !== void 0 ? {
                  agentOptions: {
                    provider: personaModel.provider,
                    model: personaModel.model
                  }
                } : {}
              },
              signal: bg?.signal ?? exec.signal
            });
            if (!started.childId || started.childId === "null" || !started.childId.includes("-")) {
              throw new Error(`oracle spawn returned an invalid child id: ${String(started.childId)}`);
            }
            fiber.childId = started.childId;
            applyPersonaModel(ctx, started.childId, "oracle");
            fibers.set(key, fiber);
            if (rolloverScorecard !== null && rolloverScorecards.has(key)) {
              rolloverScorecards.delete(key);
            }
          } catch (err) {
            fibers.delete(key);
            throw err;
          }
        } else {
          await queueHostSubagentPrompt(
            ctx.subagents,
            parent,
            fiber.childId,
            prompt,
            { kind: "user" },
            bg?.signal ?? exec.signal
          );
        }
        if (bg !== null) {
          handedOff = true;
          const childId = fiber.childId;
          void (async () => {
            try {
              const t = await waitForChildTurn(ctx, childId, bg.signal, resolveOracleTimeoutMs(ctx));
              const v = parseVerdict(t);
              fiber.consultations += 1;
              fiber.scorecard.verdicts.push({ approved: v.approved, concerns: v.concerns });
              if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files);
              if (fiber.consultations >= 10) {
                rolloverScorecards.set(key, fiber.scorecard);
                fibers.delete(key);
              }
              const agent = ctx.get("agents")?.get(parent.session.id);
              if (agent !== void 0) {
                agent.inject(createUserMessage({
                  content: [{
                    type: "text",
                    text: `\u{1F4EC} Oracle (background) finished \u2014 ${v.approved ? "APPROVED" : "CONCERNS"} (${v.concerns.length} concern(s)).

${t}`
                  }],
                  source: { kind: "plugin", plugin: "enpoi-oracle" }
                }));
              }
            } catch {
            } finally {
              stopWatch?.();
              busy.delete(key);
            }
          })();
          return {
            approved: false,
            concerns: [],
            unverified: [],
            blockers: [],
            summary: `Background consultation started (${childId}) \u2014 the verdict will be delivered as a message when the oracle finishes.`,
            background: true
          };
        }
        let verdictText = "";
        try {
          verdictText = await waitForChildTurn(ctx, fiber.childId, bg?.signal ?? exec.signal, resolveOracleTimeoutMs(ctx));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          fibers.delete(key);
          return {
            approved: false,
            concerns: [`Oracle consultation failed: ${errMsg}`],
            unverified: [],
            blockers: [`ORACLE_MODEL_ERROR: ${errMsg}`],
            summary: `Oracle consultation failed: ${errMsg}`,
            rejected: true
          };
        }
        const verdict = parseVerdict(verdictText);
        fiber.consultations += 1;
        fiber.scorecard.verdicts.push({ approved: verdict.approved, concerns: verdict.concerns });
        if (Array.isArray(args.files)) fiber.scorecard.files.push(...args.files);
        if (fiber.consultations >= 10) {
          rolloverScorecards.set(key, fiber.scorecard);
          fibers.delete(key);
        }
        return {
          approved: verdict.approved,
          concerns: verdict.concerns,
          unverified: verdict.unverified,
          blockers: verdict.blockers,
          summary: verdictText
        };
      } finally {
        if (!handedOff) {
          stopWatch?.();
          busy.delete(key);
        }
      }
    }
  });
}
export {
  apply,
  buildInitialPackage,
  inject,
  name,
  resolveOracleTimeoutMs,
  resolvePersonaModel
};
