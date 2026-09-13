// src/index.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { openMemoryDb } from "dsh-enpoi-memory";
import { makePipeline } from "dsh-enpoi-memory";
var name = "enpoi-dispatcher";
var inject = ["tools", "subagents"];
var PERSONAS = {
  fixer: [
    "You are a Fixer \u2014 a bounded parallel implementation worker.",
    "You execute EXACTLY the task card given. You do not redesign, you do not scope-creep.",
    "You may read and edit files, but ONLY within the scope and constraints listed.",
    "While implementing, note any bugs, race conditions, or edge cases you notice and report them.",
    "Finish with the required structured return: files changed, verified status, facts to remember."
  ].join("\n"),
  explorer: [
    "You are an Explorer \u2014 a codebase mapper and file discoverer.",
    "Your lane: comprehensive understanding of where things are before planning.",
    "You read and search; you NEVER edit files.",
    "Report findings as a concise map: locations, symbols, patterns, references."
  ].join("\n"),
  librarian: [
    "You are a Librarian \u2014 an exhaustive external researcher.",
    "Your lane: libraries, best practices, APIs, bugs, external context.",
    "Use web research and file reads; you NEVER edit files.",
    "Return the truth with sources, not opinions."
  ].join("\n"),
  designer: [
    "You are a Designer \u2014 UI/UX execution.",
    "Your lane: user-facing interfaces, responsive layouts, visual consistency, styling.",
    "Follow the existing design system and the task-card constraints strictly.",
    "You may read and edit UI files only. Report what you changed."
  ].join("\n")
};
function parentAborted(session) {
  const events = session.snapshotEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "turn/end") continue;
    const reason = e.data.reason;
    return reason.kind === "aborted" && reason.reason?.kind === "user";
  }
  return false;
}
async function intakeWorkerClaims(worker, session, structured, verified, provenance) {
  const remember = Array.isArray(structured?.remember_later) ? structured.remember_later : [];
  if (remember.length === 0) return;
  try {
    const db = openMemoryDb();
    const mem = makePipeline(db);
    await mem.intake(
      remember.map((f) => ({ fact: String(f).slice(0, 400), category: "PROJECT" })),
      {
        origin: `worker:${worker}`,
        trust: verified ? "verified_execution" : "untrusted_external",
        parentAborted: parentAborted(session),
        provenance
      }
    );
  } catch {
  }
}
var TOOL_FILTERS = {
  fixer: { deny: ["oracle_review", "dispatch_task", "subagent", "subagent_fork", "subagent_codex", "subagent_claude_code"] },
  explorer: { deny: ["oracle_review", "dispatch_task", "subagent", "subagent_fork", "bash", "edit", "write", "str_replace_editor", "todo_write", "plan_mode", "goal"] },
  librarian: { deny: ["oracle_review", "dispatch_task", "subagent", "subagent_fork", "bash", "edit", "write", "str_replace_editor", "todo_write", "plan_mode", "goal"] },
  designer: { deny: ["oracle_review", "dispatch_task", "subagent", "subagent_fork", "subagent_codex", "subagent_claude_code"] }
};
var SUBAGENT_RETURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    changed: { type: "array", items: { type: "string" }, description: "Files modified by the worker (if any)" },
    verified: { type: "boolean", description: "Whether file changes were verified" },
    NOT_verified: { type: "array", items: { type: "string" }, description: "Changed files that could not be verified" },
    remember_later: { type: "array", items: { type: "string" }, description: "Important facts or architecture decisions to remember" },
    summary: { type: "string", description: "Comprehensive findings, research report, or implementation summary" }
  },
  required: ["summary"]
};
function readLivingBrief(ctx, session) {
  try {
    const projections = ctx.get("sessionProjections");
    if (projections === void 0) return null;
    const view = projections.snapshot(session).values?.livingBrief;
    if (view === void 0 || view === null) return null;
    const prose = typeof view.prose === "object" && view.prose !== null ? view.prose : null;
    const freshness = typeof view.freshness === "string" ? view.freshness : "stale";
    const parts = [
      view.goal !== void 0 && view.goal !== "" ? `Goal: ${String(view.goal)}` : null,
      Array.isArray(view.decisions) && view.decisions.length > 0 ? `Decisions: ${view.decisions.map((d) => d.text).join("; ")}` : null,
      prose !== null ? `Keeper synthesis: ${String(prose.text)}` : null,
      `Brief freshness: ${freshness}`
    ].filter((p) => p !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}
function buildTaskCard(worker, args, brief) {
  const lines = ["--- TASK CARD ---"];
  lines.push(`Worker role: ${worker}`);
  lines.push(`Objective: ${args.objective}`);
  if (args.scope !== void 0 && args.scope !== "") lines.push(`Scope: ${args.scope}`);
  if (args.constraints !== void 0 && args.constraints !== "") lines.push(`Constraints: ${args.constraints}`);
  if (Array.isArray(args.files) && args.files.length > 0) {
    lines.push("Files:");
    for (const f of args.files) lines.push(`- ${f}`);
  }
  if (brief !== null) {
    const flagged = brief.includes("Brief freshness: stale") || brief.includes("Brief freshness: cooling") ? "\n[PROSE UNVERIFIED] The session brief prose may be stale \u2014 rely on the deterministic fields and the task card above." : "";
    lines.push("--- SESSION BRIEF ---");
    lines.push(brief + flagged);
  }
  lines.push("--- RETURN CONTRACT ---");
  lines.push("Finish with a comprehensive summary in `summary` (findings, research report, or implementation status). If you modified files, list them in `changed` and set `verified`.");
  return lines.join("\n");
}
function applyPersonaModel(ctx, childId, persona) {
  try {
    const settings = ctx.get("settings");
    const doc = settings?.get?.("enpoi-orchestration");
    const key = persona.toLowerCase().replace(/^the\s+/, "").trim();
    const entry = doc?.personas?.[key];
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
function apply(ctx) {
  ctx.inject(["tools", "subagents"], (injected) => {
    registerDispatcher(injected);
  });
}
function registerDispatcher(ctx) {
  ctx = ctx.root;
  const fileLocks = /* @__PURE__ */ new Map();
  const definition = {
    name: "dispatch_task",
    description: [
      "Dispatch a bounded worker subagent with a strict Task Card. Workers: fixer (parallel bounded implementation),",
      "explorer (codebase mapping), librarian (external research), designer (UI/UX execution).",
      "The worker gets ONLY the task card + session brief \u2014 never the raw conversation.",
      "Pass exact file paths; the dispatcher locks them against concurrent workers. Blocking by default;",
      "set background:true to keep working \u2014 the result is then delivered to you as a message."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        worker: { type: "string", enum: ["fixer", "explorer", "librarian", "designer"], description: "Worker role: fixer (bounded implementation), explorer (codebase mapping/research), librarian (external/web research), designer (UI)" },
        objective: { type: "string", description: "The precise thing to do \u2014 self-contained" },
        scope: { type: "string", description: "What is in bounds (directories, files, subsystems)" },
        constraints: { type: "string", description: "Hard rules: do not touch X, follow Y, no redesign" },
        files: { type: "array", items: { type: "string" }, description: "Exact file paths the worker may need (locked against other workers)" },
        background: { type: "boolean", description: "Run in the background \u2014 returns immediately; the result arrives as a delivered message. Omit for blocking." }
      },
      required: ["worker", "objective"]
    },
    output: {
      schema: SUBAGENT_RETURN_SCHEMA,
      render: (_args, value) => {
        const parts = [];
        if (Array.isArray(value.changed) && value.changed.length > 0) {
          parts.push(`**Files Changed:** ${value.changed.join(", ")} (${value.verified ? "verified" : "unverified"})`);
        }
        if (typeof value.summary === "string" && value.summary.trim() !== "") {
          parts.push(value.summary.trim());
        }
        return [{ type: "text", text: parts.join("\n\n") || "Worker completed." }];
      }
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent;
      if (parent === void 0) throw new Error("dispatch_task requires a calling agent");
      if (!(args.worker in PERSONAS)) {
        return { changed: [], verified: false, NOT_verified: [], remember_later: [], summary: `Unknown worker '${args.worker}'` };
      }
      const targetFiles = Array.isArray(args.files) ? args.files : [];
      const held = targetFiles.filter((f) => fileLocks.has(f));
      if (held.length > 0) {
        return {
          changed: [],
          verified: false,
          NOT_verified: [],
          remember_later: [],
          summary: `FILE_LOCK_HELD: ${held.join(", ")} (locked by another worker; wait or pick different files)`
        };
      }
      for (const f of targetFiles) fileLocks.set(f, parent.session.id);
      let bg = null;
      let stopWatch = null;
      let handedOff = false;
      const releaseLocks = () => {
        for (const f of targetFiles) fileLocks.delete(f);
      };
      try {
        const brief = readLivingBrief(ctx, parent.session);
        const taskCard = buildTaskCard(args.worker, args, brief);
        const rawFilter = TOOL_FILTERS[args.worker];
        const denied = rawFilter?.deny?.filter((name2) => ctx.tools.get(name2) !== void 0);
        const toolFilter = denied && denied.length > 0 ? { deny: denied } : void 0;
        const persona = PERSONAS[args.worker];
        if (args.background === true) {
          bg = new AbortController();
          stopWatch = ctx.on("session/event", (s, e) => {
            if (s.id !== parent.session.id) return;
            if (e.type === "turn/end" && e.data.reason.kind === "aborted" && e.data.reason.reason?.kind === "user") bg?.abort();
          });
        }
        const run = await ctx.subagents.start("spawn", {
          label: `${args.worker}: ${args.objective.slice(0, 60)}`,
          prompt: [{ type: "text", text: taskCard }],
          parent,
          persona,
          toolFilter,
          outputSchema: SUBAGENT_RETURN_SCHEMA,
          signal: bg?.signal ?? exec.signal
        });
        if (run.localAgent?.session?.id) {
          applyPersonaModel(ctx, run.localAgent.session.id, args.worker);
        }
        if (bg !== null) {
          handedOff = true;
          void (async () => {
            try {
              const result2 = await run.result;
              const structured2 = result2.structured;
              const summaryText2 = typeof structured2?.summary === "string" && structured2.summary.trim() !== "" ? structured2.summary.trim() : typeof result2.text === "string" && result2.text.trim() !== "" ? result2.text.trim() : "Worker completed.";
              const changedText = Array.isArray(structured2?.changed) && structured2.changed.length > 0 ? ` \u2014 changed: ${structured2.changed.join(", ")} (${structured2.verified ? "verified" : "unverified"})` : "";
              const agent = ctx.get("agents")?.get(parent.session.id);
              if (agent !== void 0) {
                agent.inject(createUserMessage({
                  content: [{
                    type: "text",
                    text: `\u{1F4EC} Worker '${args.worker}' (background) finished${changedText}.

${summaryText2}`
                  }],
                  source: { kind: "plugin", plugin: "enpoi-dispatcher" }
                }));
              }
              await intakeWorkerClaims(
                args.worker,
                parent.session,
                structured2,
                structured2?.verified === true,
                JSON.stringify({ parentSessionId: parent.session.id, background: true })
              );
            } catch {
            } finally {
              stopWatch?.();
              releaseLocks();
            }
          })();
          return {
            changed: [],
            verified: false,
            NOT_verified: [],
            remember_later: [],
            summary: `Background ${args.worker} started \u2014 the result will be delivered as a message when it finishes.`
          };
        }
        const result = await run.result;
        const structured = result.structured;
        const summaryText = typeof structured?.summary === "string" && structured.summary.trim() !== "" ? structured.summary.trim() : typeof result.text === "string" && result.text.trim() !== "" ? result.text.trim() : "Worker completed.";
        await intakeWorkerClaims(
          args.worker,
          parent.session,
          structured,
          structured?.verified === true,
          JSON.stringify({ parentSessionId: parent.session.id })
        );
        return {
          changed: structured?.changed ?? [],
          verified: structured?.verified ?? false,
          NOT_verified: structured?.NOT_verified ?? [],
          remember_later: structured?.remember_later ?? [],
          summary: summaryText
        };
      } finally {
        if (!handedOff) {
          stopWatch?.();
          releaseLocks();
        }
      }
    }
  };
  ctx.tools.register(definition);
}
export {
  apply,
  inject,
  name
};
