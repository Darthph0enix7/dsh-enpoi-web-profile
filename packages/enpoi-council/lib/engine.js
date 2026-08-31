// src/engine.ts
import { createHash } from "node:crypto";
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
function createTraceContext(persona, parent, runId, seq) {
  const hash = createHash("sha256").update(`${parent.id}:${runId}:${persona}:${seq}`).digest("hex").slice(0, 12);
  return {
    traceId: `trace-${hash}`,
    runId,
    persona,
    parentSeq: parent.seq,
    seq
  };
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
          const { join: join2 } = await import("node:path");
          const { homedir: homedir2 } = await import("node:os");
          appendFileSync2(
            join2(homedir2(), ".dsh", "logs", "council-diag.log"),
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
            const { join: join2 } = await import("node:path");
            const { homedir: homedir2 } = await import("node:os");
            appendFileSync2(
              join2(homedir2(), ".dsh", "logs", "council-diag.log"),
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
              const { join: join2 } = await import("node:path");
              const { homedir: homedir2 } = await import("node:os");
              appendFileSync2(
                join2(homedir2(), ".dsh", "logs", "council-diag.log"),
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
export {
  MAX_DEBATE_TOKENS,
  applyPersonaModel,
  createTraceContext,
  disposeCouncilFibers,
  estimateTokens,
  executeParallelRound,
  followupDebaterFiber,
  resolvePersonaModel,
  startDebaterFiber,
  textOfContent,
  waitForFiberTurn
};
