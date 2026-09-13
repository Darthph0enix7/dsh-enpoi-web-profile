var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/index.ts
import Schema from "schemastery";

// src/core/fiber.ts
import { queueHostSubagentPrompt } from "@deepseek-ai/dsh-subagent/internal";
import { getBriefService } from "dsh-enpoi-context-keeper";
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
var BRIEF_WAIT_MS = 4e3;
async function ensureBriefWithin(parent, signal, waitMs = BRIEF_WAIT_MS) {
  const brief = getBriefService();
  if (brief === null || brief === void 0) return;
  const pending = brief.ensureFreshBrief(parent.session, signal).catch((error) => {
    councilDiag(`brief wait degraded: ${String(error)}`);
    return null;
  });
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  try {
    await Promise.race([pending.then(() => void 0), timeout]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
  if (signal.aborted) throw signal.reason ?? new Error("aborted");
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
        const blockType = part.type;
        if ((blockType === "text" || blockType === void 0) && "text" in part && typeof part.text === "string") {
          return part.text;
        }
      }
      return "";
    }).filter((t) => t.length > 0).join("\n");
  }
  return "";
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
var COUNCIL_DENIED_TOOLS = [
  "send_message",
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
  "memory_confirm",
  "workflow",
  "ralph",
  "create_goal",
  "get_goal",
  "update_goal",
  "exit_plan_mode",
  "job_output",
  "job_list",
  "job_kill",
  "skill",
  "ask_user_question",
  // Councils cannot register sub-councils (amendment #10)
  "council_register"
];
var RETRIEVAL_TOOLS = ["read", "glob", "grep", "read_image", "web_search", "web_fetch"];
var DEBATER_DENIED_TOOLS = [...COUNCIL_DENIED_TOOLS, ...RETRIEVAL_TOOLS];
var BROKER_KEPT_TOOLS = [...RETRIEVAL_TOOLS];
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
    }
  } catch (err) {
    councilDiag(`applyPersonaModel warning for ${persona}: ${String(err)}`);
  }
}
async function startSeatFiber(ctx, parent, opts, signal) {
  const personaModel = resolvePersonaModel(ctx, opts.seatId);
  const started = await ctx.subagents.startContinuable({
    provider: "spawn",
    label: opts.label,
    quiet: true,
    request: {
      prompt: [{ type: "text", text: opts.initialPrompt }],
      parent,
      persona: opts.persona,
      quiet: true,
      toolFilter: opts.denyTools.length > 0 ? { deny: [...opts.denyTools] } : void 0,
      ...personaModel !== void 0 ? {
        agentOptions: { provider: personaModel.provider, model: personaModel.model }
      } : {}
    },
    signal
  });
  if (!started.childId || started.childId === "null" || !String(started.childId).includes("-")) {
    throw new Error(`council seat spawn returned an invalid child id for ${opts.seatId}: ${String(started.childId)}`);
  }
  applyPersonaModel(ctx, started.childId, opts.seatId);
  return { seatId: opts.seatId, label: opts.label, childId: started.childId, isOffline: false, totalTokens: 0 };
}
async function followupSeatFiber(ctx, parent, fiber, promptText, signal, timeoutMs = 3e4) {
  let timer;
  try {
    await Promise.race([
      queueHostSubagentPrompt(
        ctx.subagents,
        parent,
        fiber.childId,
        [{ type: "text", text: promptText }],
        { kind: "user" },
        signal
      ),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`council followup to ${fiber.seatId} (${fiber.childId}) timed out after ${timeoutMs}ms \u2014 child activation lock stuck`));
        }, timeoutMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("council followup aborted"));
        }, { once: true });
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function waitForSeatTurn(ctx, childId, signal, timeoutMs = 9e4) {
  const started = Date.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (; ; ) {
      if (signal.aborted) throw new Error("council deliberation aborted");
      if (Date.now() - started > timeoutMs) throw new Error(`council seat timed out after ${timeoutMs}ms`);
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
            if (extracted.length > 0) return extracted;
          }
          const turnEnd = events.find((e) => e.type === "turn/end" && e.seq > since);
          if (turnEnd !== void 0) {
            const reason = turnEnd.data?.reason;
            if (reason?.kind === "error") {
              throw new Error(`Turn failed: ${reason.error?.message ?? reason.failure?.message ?? "Model execution failed"}`);
            }
            if (reason?.kind === "aborted") {
              throw new Error(`Turn was aborted (${reason.reason?.kind ?? "cancelled"})`);
            }
            if (reason?.kind === "completed" && messages.length === 0) {
              return "[NO_OUTPUT: seat returned empty content]";
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
async function disposeSeatFibers(ctx, fibers) {
  for (const fiber of fibers) {
    if (!fiber.childId) continue;
    try {
      const sessionStore = ctx.get("sessions");
      if (sessionStore !== void 0) {
        await sessionStore.delete(fiber.childId);
      }
    } catch {
    }
  }
}
function getLivingBriefText(ctx, parent) {
  try {
    const projections = ctx.get("sessionProjections");
    const snap = projections?.snapshot?.(parent.session);
    const lb = snap?.values?.livingBrief;
    if (lb) {
      const goal = lb.goal ? `Goal: ${lb.goal}` : "";
      const prose = lb.prose?.text ?? "";
      const decisions = lb.decisions && lb.decisions.length > 0 ? `Decisions:
${lb.decisions.map((d) => `\u2022 ${d.text}`).join("\n")}` : "";
      return [goal, prose, decisions].filter(Boolean).join("\n\n");
    }
  } catch {
  }
  return "";
}

// src/core/broker.ts
import { createHash } from "node:crypto";
function extractEvidenceRequests(seatId, epoch, turnText) {
  const out = [];
  const strip = (v) => v.trim().replace(/^[`"'(\s]+/, "").replace(/[`"')\s.,;]+$/, "").trim();
  for (const rawLine of turnText.split(/\n/)) {
    const m = rawLine.match(/NEED_EVIDENCE\s*\(?\s*target\s*[:=]\s*(.+?)\s*,\s*question\s*[:=]\s*(.+)$/i);
    if (m === null) continue;
    const target = strip(m[1]);
    const question = strip(m[2]);
    if (target.length === 0 || question.length === 0) continue;
    out.push({ ticket: fpTicket(target, question), seatId, target, question, epoch });
  }
  return out;
}
function fpTicket(target, question) {
  return "EV-" + createHash("sha256").update(`${target}::${question}`.toLowerCase()).digest("hex").slice(0, 8);
}
var EvidenceQueue = class {
  pending = /* @__PURE__ */ new Map();
  push(reqs, vault) {
    const added = [];
    for (const req of reqs) {
      if (this.pending.has(req.ticket)) continue;
      if (vault.all().some((e) => e.question.toLowerCase() === req.question.toLowerCase() && e.supersededBy === null)) continue;
      this.pending.set(req.ticket, req);
      added.push(req);
    }
    return added;
  }
  drain() {
    const all = [...this.pending.values()];
    this.pending.clear();
    return all;
  }
  get size() {
    return this.pending.size;
  }
};
var BROKER_PERSONA = [
  "You are the Council Evidence Broker \u2014 a precision research assistant serving a high-stakes deliberation.",
  "You answer EXACTLY the question asked, from the codebase (read/glob/grep) or the web (web_search/web_fetch), and nothing else.",
  "Output format \u2014 a FACT SHEET and nothing more:",
  "CITATION: the ACTUAL file path with line number, or the exact URL you read. Never a placeholder, never a template \u2014 a real path you personally opened.",
  "FACTS: the answer, maximum 150 words, only what the question asked.",
  "CONFIDENCE: high | medium | low \u2014 one word",
  'Never speculate. If the answer is not findable, say "NOT FINDABLE" and show the closest citation.'
].join("\n");
function isExternalTarget(target) {
  return /\b(web|http|npm|docs?|library|libraries|package|registry|external|api)\b/i.test(target);
}
async function serviceEvidenceQueue(ctx, parent, queue, vault, epoch, signal, timeoutMs) {
  if (queue.length === 0) return { sheets: 0, errors: [] };
  const errors = [];
  councilDiag(`[broker] servicing ${queue.length} evidence request(s) at epoch ${epoch}`);
  const tasks = queue.map(async (req) => {
    const retrievedBy = isExternalTarget(req.target) ? "librarian" : "explorer";
    const prompt = [
      `TARGET: ${req.target}`,
      `QUESTION: ${req.question}`,
      "Produce the FACT SHEET now."
    ].join("\n");
    let fiber;
    try {
      fiber = await startSeatFiber(ctx, parent, {
        seatId: retrievedBy,
        label: `council broker: ${req.ticket}`,
        persona: BROKER_PERSONA,
        initialPrompt: prompt,
        // Broker keeps the research surface; everything else stays denied.
        denyTools: COUNCIL_DENIED_TOOLS.filter((t) => !BROKER_KEPT_TOOLS.includes(t))
      }, signal);
      const text = await waitForSeatTurn(ctx, fiber.childId, signal, timeoutMs);
      const parsed = parseFactSheet(text);
      const tokens = estimateTokens(text);
      void tokens;
      if (parsed === null) {
        errors.push(`${req.ticket}: unparseable fact sheet`);
        return;
      }
      vault.add({
        citation: parsed.citation,
        question: req.question,
        factSheet: `${parsed.facts}
CONFIDENCE: ${parsed.confidence}`,
        addedEpoch: epoch,
        retrievedBy
      });
      councilDiag(`[broker] ${req.ticket} satisfied via ${retrievedBy} (${parsed.citation})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${req.ticket}: ${msg}`);
      councilDiag(`[broker] ${req.ticket} FAILED: ${msg}`);
    } finally {
      if (fiber !== void 0) {
        try {
          await disposeSeatFibers(ctx, [fiber]);
        } catch {
        }
      }
    }
  });
  await Promise.allSettled(tasks);
  return { sheets: vault.since(epoch).length, errors };
}
function parseFactSheet(text) {
  const plain = text.replace(/\*\*/g, "");
  const rawCitation = plain.match(/CITATION\s*[:=]\s*(.+)/i)?.[1]?.trim();
  const facts = plain.match(/FACTS\s*[:=]\s*([\s\S]*?)(?:CONFIDENCE\s*[:=]|$)/i)?.[1]?.trim();
  const confidence = plain.match(/CONFIDENCE\s*[:=]\s*(high|medium|low)/i)?.[1]?.toLowerCase();
  if (!rawCitation || !facts) return null;
  const placeholder = /<file:line|url\s*—|— exact>|your citation/i.test(rawCitation);
  const citation = placeholder ? "unverified (broker echoed template)" : rawCitation;
  return { citation, facts, confidence: placeholder ? "low" : confidence ?? "medium" };
}

// ../../node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/core/spec.ts
var SeatSpecSchema = external_exports.object({
  id: external_exports.string().regex(/^[a-z0-9_-]{2,32}$/),
  label: external_exports.string().min(1).max(64),
  /** Persona text injected as the seat's system context. */
  persona: external_exports.string().min(1),
  /**
   * Ledger operations this seat may propose (engine-enforced mechanically —
   * not prompt-only). Empty array = may propose nothing (pure analyst).
   * Referenced kinds must exist in the ledger schema.
   */
  opGates: external_exports.array(external_exports.string()).default([]),
  /**
   * Model-family hint for the default routing policy (doc 54 §2.2):
   * 'adversarial' | 'systemic' | 'practical' | 'divergent' | 'empirical'.
   * Advisory only — actual routes come from enpoi-orchestration.personas.
   */
  family: external_exports.enum(["adversarial", "systemic", "practical", "divergent", "empirical", "neutral"]).default("neutral")
});
var LedgerStatusSchema = external_exports.enum(["open", "contested", "invariant", "falsified", "dissent"]);
var TRANSITION_DAG = Object.freeze({
  open: Object.freeze(["contested"]),
  contested: Object.freeze(["invariant", "falsified", "dissent"]),
  invariant: Object.freeze([]),
  falsified: Object.freeze([]),
  dissent: Object.freeze([])
});
function isTransitionAllowed(from, to) {
  return from !== to && TRANSITION_DAG[from].includes(to);
}
var LedgerEntrySchema = external_exports.object({
  id: external_exports.string(),
  // 'C-1', 'R-2', 'I-1' …
  kind: external_exports.string(),
  // profile-defined: 'crux' | 'risk' | 'fact' | 'idea' …
  assertion: external_exports.string(),
  // the referee admits proposed assertions verbatim — never rewrites
  evidenceRef: external_exports.string().nullable().default(null),
  // vault citation (required for invariant)
  status: LedgerStatusSchema.default("open"),
  /** Epoch in which the entry was admitted (engine-set; drives the birth-epoch rule). */
  birthEpoch: external_exports.number().int().nonnegative().default(0),
  /** Seat that proposed the entry (provenance). */
  author: external_exports.string(),
  /** Append-only ruling history: {epoch, from, to, reason}. */
  history: external_exports.array(external_exports.object({
    epoch: external_exports.number().int().nonnegative(),
    from: LedgerStatusSchema,
    to: LedgerStatusSchema,
    reason: external_exports.string()
  })).default([])
});
var ForestEdgeSchema = external_exports.object({
  op: external_exports.enum(["SPROUT", "BRANCH", "FUSE", "TENSION"]),
  from: external_exports.string().nullable(),
  // parent idea id (null for SPROUT roots)
  to: external_exports.string(),
  // child idea id
  epoch: external_exports.number().int().nonnegative(),
  seat: external_exports.string()
});
var CouncilSpecSchema = external_exports.object({
  id: external_exports.string().regex(/^[a-z0-9_-]{2,32}$/),
  label: external_exports.string().min(1).max(64),
  description: external_exports.string().default(""),
  seats: external_exports.array(SeatSpecSchema).min(2).max(8),
  ledgerKinds: external_exports.array(external_exports.object({
    kind: external_exports.string(),
    idPrefix: external_exports.string().min(1).max(4),
    /** Which statuses are meaningful for this kind (subset ordering follows the DAG). */
    terminalStatuses: external_exports.array(LedgerStatusSchema).min(1)
  })).min(1),
  /** Ops a contender turn may propose (profile vocabulary, e.g. CONCEDE/DEFEND/…). */
  actions: external_exports.array(external_exports.string()).min(1),
  steelman: external_exports.boolean().default(false),
  scopeContract: external_exports.string().default(""),
  /** 'blind' = epoch 0 independent formulation; 'open' = straight to rounds. */
  opening: external_exports.enum(["blind", "open"]).default("blind"),
  preflightInventory: external_exports.boolean().default(false),
  /** Forest mode (chorus): entries are idea nodes; edges carry the structure; nothing is ever deleted. */
  forestMode: external_exports.boolean().default(false),
  deliverableSections: external_exports.array(external_exports.string()).min(1)
});
var DeclarativeStoppingPolicySchema = external_exports.object({
  type: external_exports.enum(["ledger_convergence", "topological_saturation", "fixed_epochs"]),
  stagnationLimit: external_exports.number().int().min(1).max(6).optional(),
  maxEpochs: external_exports.number().int().min(1).max(12).optional()
});

// src/core/ledger.ts
function assertionOverlap(a, b) {
  const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9äöüß\s]/gi, " ").split(/\s+/).filter((t) => t.length > 3));
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}
var Ledger = class {
  constructor(opts = {}) {
    this.opts = opts;
  }
  entries = /* @__PURE__ */ new Map();
  edges = [];
  epoch = 0;
  seq = 0;
  state() {
    return {
      epoch: this.epoch,
      entries: [...this.entries.values()].map((e) => ({ ...e, history: [...e.history] })),
      edges: this.edges.map((e) => ({ ...e }))
    };
  }
  /** Advance the ledger's clock (called by the engine at each epoch boundary). */
  setEpoch(epoch) {
    this.epoch = epoch;
  }
  entry(id) {
    return this.entries.get(id);
  }
  entriesByKind(kind) {
    return [...this.entries.values()].filter((e) => e.kind === kind);
  }
  /** Terminal statuses across the ledger (profile-defined per kind live in the spec). */
  openCount(terminal) {
    return [...this.entries.values()].filter((e) => !terminal.has(e.status)).length;
  }
  /**
   * Procedural admission (amendment #7): the entry text is stored VERBATIM —
   * the referee admits or dedupes, never rewrites. Duplicate = same kind +
   * high token overlap with a live (non-terminal) entry.
   */
  admit(req) {
    const threshold = this.opts.dedupeThreshold ?? 0.72;
    for (const existing of this.entries.values()) {
      if (existing.kind !== req.kind) continue;
      const terminalish = existing.status === "falsified" || existing.status === "dissent";
      if (terminalish) continue;
      if (assertionOverlap(existing.assertion, req.assertion) >= threshold) {
        return { ok: false, code: "duplicate", detail: `overlaps ${existing.id}`, existingId: existing.id };
      }
    }
    this.seq += 1;
    const entry = {
      id: `${req.idPrefix}-${this.seq}`,
      kind: req.kind,
      assertion: req.assertion,
      evidenceRef: req.evidenceRef ?? null,
      status: "open",
      birthEpoch: req.epoch,
      author: req.author,
      history: []
    };
    this.entries.set(entry.id, entry);
    return { ok: true, entry: { ...entry, history: [...entry.history] } };
  }
  /**
   * Referee status flip — engine-enforced (amendment #6):
   *  - strict DAG, no self-loops
   *  - terminal states irreversible
   *  - `invariant` unreachable in the entry's birth epoch
   *  - `invariant` requires an evidenceRef on the entry
   */
  flip(req) {
    const entry = this.entries.get(req.entryId);
    if (!entry) return { ok: false, code: "unknown-entry", detail: req.entryId };
    if (entry.status === req.to) {
      return { ok: false, code: "illegal-transition", detail: `${entry.id} already ${req.to}` };
    }
    if (!isTransitionAllowed(entry.status, req.to)) {
      if (TRANSITION_TERMINAL.has(entry.status)) {
        return { ok: false, code: "terminal-irreversible", detail: `${entry.id} is ${entry.status}` };
      }
      return { ok: false, code: "illegal-transition", detail: `${entry.status} \u2192 ${req.to} violates the DAG` };
    }
    if (req.to === "invariant" && entry.birthEpoch === req.epoch) {
      return { ok: false, code: "birth-epoch", detail: `${entry.id} introduced this epoch \u2014 must survive one cross-examination` };
    }
    if (req.to === "invariant" && !entry.evidenceRef) {
      return { ok: false, code: "invariant-needs-evidence", detail: `${entry.id} has no evidenceRef in the vault` };
    }
    const from = entry.status;
    entry.status = req.to;
    entry.history.push({ epoch: req.epoch, from, to: req.to, reason: req.reason });
    return { ok: true, entry: { ...entry, history: [...entry.history] } };
  }
  /** Forest edge (chorus). Append-only: no delete, no reject. */
  link(edge) {
    const full = { ...edge, epoch: this.epoch };
    this.edges.push(full);
    return full;
  }
  /** Ideas created since the given epoch (chorus saturation detection). */
  newIdeasSince(epoch) {
    return [...this.entries.values()].filter((e) => e.birthEpoch >= epoch).length;
  }
  newEdgesSince(epoch) {
    return this.edges.filter((e) => e.epoch >= epoch).length;
  }
  /**
   * The engine's materiality diff: how many entry STATUSES flipped in the
   * given epoch. CONCUR/PASS lines and prose never count (amendment #6).
   */
  flipsInEpoch(epoch) {
    let flips = 0;
    for (const e of this.entries.values()) {
      flips += e.history.filter((h) => h.epoch === epoch).length;
    }
    return flips;
  }
  /** Entries ADMITTED in the given epoch (chorus materiality: new ideas). */
  admissionsInEpoch(epoch) {
    return [...this.entries.values()].filter((e) => e.birthEpoch === epoch).length;
  }
};
var TRANSITION_TERMINAL = /* @__PURE__ */ new Set(["invariant", "falsified", "dissent"]);

// src/core/stopping.ts
function initialRuntime() {
  return { zeroFlipRun: 0, challengeFired: false, consolidationFired: false, tokens: 0 };
}
function evaluate(state, runtime, params, terminalStatuses) {
  if (state.epoch >= params.defaultMaxRounds) {
    return { action: "terminate", reason: `max rounds (${params.defaultMaxRounds}) reached` };
  }
  if (runtime.tokens >= params.maxDebateTokens) {
    return { action: "terminate", reason: `token ceiling (${params.maxDebateTokens}) reached` };
  }
  const open = state.entries.filter((e) => !terminalStatuses.has(e.status)).length;
  if (state.entries.length > 0 && open === 0) {
    return { action: "terminate", reason: "all ledger entries reached terminal states" };
  }
  if (state.entries.length === 0) {
    return { action: "terminate", reason: "no ledger entries were ever admitted" };
  }
  if (runtime.zeroFlipRun >= params.stagnationLimit) {
    if (params.challengeRound && !runtime.challengeFired) {
      return { action: "final-challenge", reason: `no ledger movement for ${runtime.zeroFlipRun} epochs` };
    }
    return { action: "terminate", reason: `stagnation (${runtime.zeroFlipRun} epochs without a state flip)` };
  }
  return { action: "continue" };
}
function afterChallenge(flipsInChallenge, runtime) {
  runtime.challengeFired = true;
  if (flipsInChallenge === 0) {
    return { action: "terminate", reason: "final challenge produced no state changes" };
  }
  if (runtime.consolidationFired) {
    return { action: "terminate", reason: "consolidation epoch after the final challenge complete" };
  }
  runtime.consolidationFired = true;
  return { action: "continue", ...{} };
}
function trackFlipRun(runtime, flipsThisEpoch, isChallengeEpoch) {
  if (isChallengeEpoch) return;
  if (flipsThisEpoch > 0) runtime.zeroFlipRun = 0;
  else runtime.zeroFlipRun += 1;
}

// src/core/referee.ts
var REFEREE_SYSTEM_BASE = [
  "You are the Referee of a high-stakes multi-agent council. You are not a debater.",
  "You manage the dispute ledger procedurally: you ADMIT proposed entries, you TOGGLE entry statuses, you issue numbered directives, you allocate the floor.",
  "You NEVER write assertions, arguments, or synthesis prose. You never introduce claims of your own.",
  "Do not call any tools or attempt code execution. You have no external tools.",
  "Rules you must enforce:",
  "- A state flip away from `contested` requires the argument to have survived scrutiny; deny flips that rest on unverified assertions (STATUS_CHANGE_DENIED: <reason>).",
  "- An attack on another seat's crux without a `STEELMAN [<seat>]:` block is denied (STATUS_CHANGE_DENIED: missing mandatory steelman).",
  "- Out-of-scope argumentation gets a scope warning and no ledger effect.",
  "Output STRICTLY one JSON object, no prose around it:",
  '{"admissions":[{"kind":"idea","assertion":"...","author":"<seat>","evidenceRef":null}],',
  ' "flips":[{"id":"I-1","to":"contested","reason":"..."}],',
  ' "directives":{"<seat>":"1. ..."},',
  ' "floor":{"active":["<seat>"],"standby":["<seat>"]},',
  ' "scopeWarnings":["..."]}'
].join("\n");
async function runRefereePass(ctx, parent, input, ledger, signal, timeoutMs) {
  const prompt = [
    `EPOCH: ${input.epoch}`,
    `COUNCIL: ${input.spec.label}`,
    input.spec.scopeContract ? `SCOPE CONTRACT:
${input.spec.scopeContract}` : "",
    `CURRENT LEDGER:
${input.ledgerText}`,
    input.vaultDeltaText ? `NEW EVIDENCE THIS EPOCH:
${input.vaultDeltaText}` : "",
    `SEAT OUTPUTS THIS EPOCH:
${input.roundTranscript}`,
    "Produce the referee JSON now. Admit proposed entries verbatim (dedupe against the ledger); flip statuses only where the burden of proof was met; issue at most 3 numbered directives per active seat; allocate the floor for the next epoch."
  ].filter(Boolean).join("\n\n");
  let fiber;
  try {
    fiber = await startSeatFiber(ctx, parent, {
      seatId: "referee",
      label: `council referee: epoch ${input.epoch}`,
      persona: REFEREE_SYSTEM_BASE,
      initialPrompt: prompt,
      denyTools: DEBATER_DENIED_TOOLS
      // referee sees no retrieval tools — ledger + transcript only
    }, signal);
    const text = await waitForSeatTurn(ctx, fiber.childId, signal, timeoutMs);
    const output = parseRefereeOutput(text, input.spec);
    const applied = applyRefereeOutput(output, ledger, input, input.spec, input.roundTranscript);
    return { output, applied };
  } finally {
    if (fiber !== void 0) {
      try {
        await disposeSeatFibers(ctx, [fiber]);
      } catch {
      }
    }
  }
}
function parseRefereeOutput(text, spec) {
  const empty = { admissions: [], flips: [], directives: {}, floor: { active: spec.seats.map((s) => s.id), standby: [] }, scopeWarnings: [] };
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    councilDiag("[referee] no JSON found \u2014 treating pass as no-op with full floor");
    return empty;
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const seatIds = new Set(spec.seats.map((s) => s.id));
    const kinds = new Set(spec.ledgerKinds.map((k) => k.kind));
    return {
      admissions: (Array.isArray(parsed.admissions) ? parsed.admissions : []).filter((a) => a && typeof a.assertion === "string" && kinds.has(a.kind)).map((a) => ({ kind: a.kind, assertion: a.assertion, author: typeof a.author === "string" ? a.author : "unknown", evidenceRef: a.evidenceRef ?? null })),
      flips: (Array.isArray(parsed.flips) ? parsed.flips : []).filter((f) => f && typeof f.id === "string" && typeof f.to === "string").map((f) => ({ id: f.id, to: f.to, reason: typeof f.reason === "string" ? f.reason : "" })),
      directives: sanitizeDirectives(parsed.directives, seatIds),
      floor: sanitizeFloor(parsed.floor, spec),
      scopeWarnings: (Array.isArray(parsed.scopeWarnings) ? parsed.scopeWarnings : []).filter((w) => typeof w === "string")
    };
  } catch (err) {
    councilDiag(`[referee] JSON parse failed: ${String(err)} \u2014 treating pass as no-op with full floor`);
    return empty;
  }
}
function sanitizeDirectives(raw, seatIds) {
  const out = {};
  if (raw !== null && typeof raw === "object") {
    for (const [seat, text] of Object.entries(raw)) {
      if (seatIds.has(seat) && typeof text === "string" && text.trim().length > 0) {
        out[seat] = text.trim().slice(0, 1200);
      }
    }
  }
  return out;
}
function sanitizeFloor(raw, spec) {
  const seatIds = spec.seats.map((s) => s.id);
  let active = seatIds;
  let standby = [];
  if (raw !== null && typeof raw === "object") {
    const r = raw;
    if (Array.isArray(r.active)) {
      const filtered = r.active.filter((s) => typeof s === "string" && seatIds.includes(s));
      if (filtered.length > 0) active = filtered;
    }
    if (Array.isArray(r.standby)) {
      standby = r.standby.filter((s) => typeof s === "string" && seatIds.includes(s) && !active.includes(s));
    }
  }
  if (active.length === 0) active = seatIds;
  return { active, standby: standby.filter((s) => !active.includes(s)) };
}
function enforceSteelman(flips, spec, roundTranscript) {
  if (!spec.steelman) return { allowed: flips, rejected: [] };
  const hasSteelman = /STEELMAN\s*\[/i.test(roundTranscript);
  if (hasSteelman) return { allowed: flips, rejected: [] };
  const allowed = [];
  const rejected = [];
  for (const flip of flips) {
    if (flip.to === "contested" || flip.to === "falsified") {
      rejected.push(`${flip.id} \u2192 ${flip.to}: STATUS_CHANGE_DENIED: missing mandatory steelman`);
    } else {
      allowed.push(flip);
    }
  }
  return { allowed, rejected };
}
function applyRefereeOutput(output, ledger, input, spec, roundTranscript) {
  const audit = { admissions: [], flips: [], rejected: [] };
  let flips = output.flips;
  if (spec !== void 0 && roundTranscript !== void 0) {
    const gate = enforceSteelman(flips, spec, roundTranscript);
    flips = gate.allowed;
    audit.rejected.push(...gate.rejected);
  }
  for (const adm of output.admissions) {
    const kindSpec = input.spec.ledgerKinds.find((k) => k.kind === adm.kind);
    if (kindSpec === void 0) continue;
    const res = ledger.admit({
      kind: adm.kind,
      assertion: adm.assertion,
      // verbatim — procedural admission
      author: adm.author,
      epoch: input.epoch,
      evidenceRef: adm.evidenceRef ?? null,
      idPrefix: kindSpec.idPrefix
    });
    if (res.ok) audit.admissions.push(`${res.entry.id} (${adm.kind}) by ${adm.author}`);
    else if (!res.ok && res.code === "duplicate") audit.rejected.push(`duplicate of ${res.existingId}`);
  }
  for (const flip of flips) {
    const res = ledger.flip({ entryId: flip.id, to: flip.to, reason: flip.reason, epoch: input.epoch });
    if (res.ok) audit.flips.push(`${flip.id} \u2192 ${flip.to}`);
    else if (!res.ok) audit.rejected.push(`${flip.id} \u2192 ${flip.to}: ${res.code} (${res.detail})`);
  }
  return audit;
}

// src/core/vault.ts
import { createHash as createHash2 } from "node:crypto";
var EvidenceVault = class {
  entries = /* @__PURE__ */ new Map();
  seq = 0;
  add(sheet) {
    this.seq += 1;
    const entry = { ...sheet, id: `F-${this.seq}`, supersededBy: null };
    this.entries.set(entry.id, entry);
    return { ...entry };
  }
  get(id) {
    const e = this.entries.get(id);
    return e ? { ...e } : void 0;
  }
  /** Has a live (non-superseded) sheet for this citation? */
  hasLiveFor(citation) {
    for (const e of this.entries.values()) {
      if (e.citation === citation && e.supersededBy === null) return true;
    }
    return false;
  }
  /** Sheets added at or after the given epoch (standby catch-up, epoch delivery). */
  since(epoch) {
    return [...this.entries.values()].filter((e) => e.addedEpoch >= epoch && e.supersededBy === null).map((e) => ({ ...e }));
  }
  all() {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }
  /** Content hash for dedupe (same question + citation → reuse). */
  static fingerprint(question, target) {
    return createHash2("sha256").update(`${target}::${question}`.toLowerCase()).digest("hex").slice(0, 16);
  }
  findByFingerprint(fp) {
    void fp;
    return void 0;
  }
  /** Render the vault (or a delta) as compact prompt text. */
  render(entries) {
    const list = entries ?? this.all();
    if (list.length === 0) return "(no evidence collected yet)";
    return list.map((e) => `[${e.id}] (${e.retrievedBy}, ${e.citation}) Q: ${e.question}
${e.factSheet}`).join("\n\n");
  }
};

// src/core/engine.ts
var MAX_SEAT_OUTPUT_CHARS = 6e3;
async function runCouncil(ctx, parent, opts) {
  const { spec, query, params, signal } = opts;
  const maxRounds = opts.maxRoundsOverride !== void 0 ? Math.min(12, Math.max(1, opts.maxRoundsOverride)) : params.defaultMaxRounds;
  const effectiveParams = { ...params, defaultMaxRounds: maxRounds };
  const audit = [];
  const ledger = new Ledger();
  const vault = new EvidenceVault();
  const queue = new EvidenceQueue();
  const runtime = initialRuntime();
  const fibers = /* @__PURE__ */ new Map();
  const lastActive = /* @__PURE__ */ new Map();
  let totalTokens = 0;
  let directives = {};
  let floor = { active: spec.seats.map((s) => s.id), standby: [] };
  let briefStall = "";
  const emitRound = (epoch, extra) => {
    try {
      opts.onRound?.({ epoch, audit: extra });
      parent.session.append("council/round", {
        epoch,
        council: spec.id,
        ledgerDiff: {
          entries: ledger.state().entries.map((e) => ({ id: e.id, kind: e.kind, status: e.status, author: e.author })),
          edges: ledger.state().edges.length
        },
        floor,
        vault: vault.since(epoch).length,
        ...extra
      });
    } catch (err) {
      councilDiag(`council/round append failed: ${String(err)}`);
    }
  };
  try {
    try {
      parent.session.append("council/started", { council: spec.id, query: query.slice(0, 160), seats: spec.seats.map((s) => s.id), blindEpoch: spec.opening === "blind" });
    } catch (err) {
      councilDiag(`council/started append failed: ${String(err)}`);
    }
    await ensureBriefWithin(parent, signal);
    const briefText = getLivingBriefText(ctx, parent);
    if (params.evidenceBroker && spec.preflightInventory) {
      try {
        const res = await serviceEvidenceQueue(
          ctx,
          parent,
          [{ ticket: "EV-preflight", seatId: "preflight", target: "this repository", question: `Map the top-level modules, key entry points, and existing docs relevant to: ${query}` }],
          vault,
          0,
          signal,
          params.evidenceTimeoutMs
        );
        audit.push(`preflight inventory: ${res.sheets} sheet(s)`);
      } catch (err) {
        councilDiag(`preflight failed (non-fatal): ${String(err)}`);
      }
    }
    const openingPrompt = (seatPersonaGate) => [
      seatPersonaGate,
      `COUNCIL: ${spec.label}`,
      `QUERY: ${query}`,
      briefText ? `LIVING BRIEF (session context):
${briefText}` : "",
      spec.scopeContract ? `SCOPE CONTRACT (violations are ruled out of order):
${spec.scopeContract}` : "",
      spec.opening === "blind" ? "BLIND FORMULATION: You are formulating INDEPENDENTLY \u2014 you cannot see the other seats. State your position in your own voice." : "",
      spec.forestMode ? "Propose ideas as SPROUT: <title> | <rationale> lines (one per idea)." : spec.ledgerKinds.some((k) => k.kind === "crux") ? "Where you identify a decisive point of disagreement, add a PROPOSE_CRUX: <assertion> line." : "",
      "If you need ground truth from the codebase or the web, add NEED_EVIDENCE(target: <area>, question: <what to verify>) lines. Evidence arrives at the next epoch boundary \u2014 conclude your arguments conditionally."
    ].filter(Boolean).join("\n\n");
    {
      councilDiag(`[council ${spec.id}] ${spec.opening} epoch 0: ${spec.seats.length} seats formulating`);
      const blindTurns = await generateParallel(ctx, parent, spec, {
        promptBuilder: (seat) => openingPrompt(seatPersona(spec, seat)),
        fibers,
        deny: true,
        epoch: 0,
        signal,
        params
      });
      totalTokens += blindTurns.tokens;
      runtime.tokens = totalTokens;
      for (const t of blindTurns.turns) {
        audit.push(`opening: ${t.seatId} ${t.tokens}t`);
        lastActive.set(t.seatId, 0);
      }
      if (params.evidenceBroker) {
        for (const t of blindTurns.turns) queue.push(extractEvidenceRequests(t.seatId, 1, t.text), vault);
        if (queue.size > 0) {
          const served = await serviceEvidenceQueue(ctx, parent, queue.drain(), vault, 1, signal, params.evidenceTimeoutMs);
          audit.push(`opening broker: ${served.sheets} sheet(s)`);
        }
      }
      ledger.setEpoch(1);
      const ingest = await runRefereePass(ctx, parent, {
        spec,
        ledgerText: renderLedger(ledger, spec),
        roundTranscript: blindTurns.turns.map((t) => `\u2500\u2500 ${t.seatId} \u2500\u2500
${t.text.slice(0, MAX_SEAT_OUTPUT_CHARS)}`).join("\n\n"),
        vaultDeltaText: vault.all().length > 0 ? vault.render() : "",
        epoch: 1,
        previousDirectives: {}
      }, ledger, signal, params.debaterTimeoutMs);
      directives = ingest.output.directives;
      floor = ingest.output.floor;
      trackFlipRun(runtime, ledger.flipsInEpoch(1) + ingest.applied.admissions.length, false);
      emitRound(1, { flips: ledger.flipsInEpoch(1), admissions: ingest.applied.admissions.length, applied: ingest.applied, phase: "ingest" });
      audit.push(`ingest: ${ingest.applied.admissions.length} admission(s)`);
    }
    let epoch = 1;
    let stopReason = "max rounds reached";
    let challengeEpoch = -1;
    let consolidationEpoch = -1;
    for (epoch = 2; epoch <= effectiveParams.defaultMaxRounds + 2; epoch++) {
      if (signal.aborted) throw new Error("council deliberation aborted");
      const isChallenge = challengeEpoch === epoch;
      const ledgerText = renderLedger(ledger, spec);
      const round = await generateParallel(ctx, parent, spec, {
        // Cumulative epistemic package per seat (amendment #4): a standby
        // re-entrant receives EVERY vault fact added since it was last active.
        promptBuilder: (seat) => {
          const seatVault = vault.since(lastActive.get(seat.id) ?? 0);
          return [
            seatPersona(spec, seat),
            `EPOCH ${epoch}${isChallenge ? " \u2014 FINAL CHALLENGE" : ""}`,
            `QUERY: ${query}`,
            briefText ? `LIVING BRIEF:
${briefText}` : "",
            spec.scopeContract ? `SCOPE CONTRACT:
${spec.scopeContract}` : "",
            `DISPUTE LEDGER:
${ledgerText}`,
            seatVault.length > 0 ? `EVIDENCE (new since you last sat):
${vault.render(seatVault)}` : "",
            directives[seat.id] ? `REFEREE DIRECTIVE TO YOU:
${directives[seat.id]}` : "",
            isChallenge ? "The deliberation has stabilized. State your strongest UNADDRESSED fatal flaw \u2014 with evidence \u2014 or emit CONCUR [entry-id] WITH <seat> to concede. Nothing else." : buildEpochInstructions(spec),
            "NEED_EVIDENCE(target: <area>, question: <what to verify>) lines request facts for the next epoch boundary."
          ].filter(Boolean).join("\n\n");
        },
        fibers,
        deny: false,
        epoch,
        signal,
        params,
        only: floor.active
      });
      for (const t of round.turns) {
        if (t.error === void 0) lastActive.set(t.seatId, epoch);
      }
      totalTokens += round.tokens;
      runtime.tokens = totalTokens;
      if (params.evidenceBroker) {
        for (const turn of round.turns) {
          queue.push(extractEvidenceRequests(turn.seatId, epoch, turn.text), vault);
        }
        if (queue.size > 0) {
          const served = await serviceEvidenceQueue(ctx, parent, queue.drain(), vault, epoch, signal, params.evidenceTimeoutMs);
          audit.push(`epoch ${epoch}: broker served ${served.sheets} sheet(s)${served.errors.length > 0 ? ` (${served.errors.length} errors)` : ""}`);
          if (served.errors.length > 0 && briefStall === "") briefStall = served.errors[0];
        }
      }
      ledger.setEpoch(epoch);
      const transcript = round.turns.map((t) => `\u2500\u2500 ${t.seatId} \u2500\u2500
${t.text.slice(0, MAX_SEAT_OUTPUT_CHARS)}`).join("\n\n");
      const referee = await runRefereePass(ctx, parent, {
        spec,
        ledgerText: renderLedger(ledger, spec),
        roundTranscript: transcript,
        vaultDeltaText: (() => {
          const ev = vault.since(epoch);
          return ev.length > 0 ? vault.render(ev) : "";
        })(),
        epoch,
        previousDirectives: directives
      }, ledger, signal, params.debaterTimeoutMs);
      directives = referee.output.directives;
      floor = referee.output.floor;
      const flips = ledger.flipsInEpoch(epoch);
      const admissions = referee.applied.admissions.length;
      const material = flips + admissions;
      trackFlipRun(runtime, material, isChallenge);
      emitRound(epoch, {
        flips,
        admissions,
        zeroFlipRun: runtime.zeroFlipRun,
        applied: referee.applied,
        scopeWarnings: referee.output.scopeWarnings,
        tokens: round.tokens
      });
      if (epoch === consolidationEpoch) {
        stopReason = "post-challenge consolidation complete";
        break;
      }
      if (isChallenge) {
        const v = afterChallenge(material, runtime);
        if (v.action === "terminate") {
          stopReason = v.reason;
          break;
        }
        consolidationEpoch = epoch + 1;
        stopReason = "post-challenge consolidation pending";
        continue;
      }
      const verdict = evaluate(ledger.state(), runtime, effectiveParams, terminalSet(spec));
      if (verdict.action === "terminate") {
        stopReason = verdict.reason;
        break;
      }
      if (verdict.action === "final-challenge") {
        challengeEpoch = epoch + 1;
        audit.push(`epoch ${epoch}: stagnation \u2192 final challenge at epoch ${epoch + 1}`);
      }
    }
    const deliverable = await runChair(ctx, parent, spec, {
      query,
      ledger,
      vault,
      transcriptNote: briefStall,
      signal,
      timeoutMs: params.debaterTimeoutMs
    });
    totalTokens += deliverable.tokens;
    const quality = computeQuality(ledger, spec);
    try {
      parent.session.append("council/finished", { council: spec.id, stopReason, roundsRun: epoch, quality });
    } catch (err) {
      councilDiag(`council/finished append failed: ${String(err)}`);
    }
    return {
      deliverable: deliverable.text,
      roundsRun: epoch,
      stopReason,
      ledgerState: ledger.state(),
      vaultAdditions: vault.all().length,
      quality,
      totalTokens,
      audit
    };
  } finally {
    try {
      await disposeSeatFibers(ctx, [...fibers.values()]);
    } catch {
    }
  }
}
function seatPersona(spec, seatId) {
  const seat = spec.seats.find((s) => s.id === seatId);
  return seat?.persona ?? `You are the ${seatId} seat of the ${spec.label} council.`;
}
function terminalSet(spec) {
  return new Set(spec.ledgerKinds.flatMap((k) => k.terminalStatuses));
}
function buildEpochInstructions(spec) {
  if (spec.forestMode) {
    return [
      "Extend the idea forest: SPROUT new directions, BRANCH variants, FUSE existing ideas, mark TENSION where reality bites an idea.",
      "Nothing is ever deleted; divergence is the goal. One idea per line: SPROUT: <title> | <rationale>."
    ].join(" ");
  }
  return [
    `Argue your assigned crux. Allowed actions: ${spec.actions.join(", ")}.`,
    spec.steelman ? "MANDATORY STEELMAN: before attacking an opponent's position, include `STEELMAN [<seat>]:` reconstructing it at its strongest and naming the boundary where it is correct. Attacks without steelman are ruled invalid." : "",
    "Reference ledger entries by id. Propose new decisive points with PROPOSE_CRUX: <assertion>."
  ].filter(Boolean).join(" ");
}
function renderLedger(ledger, spec) {
  const s = ledger.state();
  if (s.entries.length === 0 && s.edges.length === 0) return "(empty \u2014 no entries admitted yet)";
  const terminal = new Set(spec.ledgerKinds.flatMap((k) => k.terminalStatuses));
  const lines = s.entries.map((e) => {
    const mark = terminal.has(e.status) ? "\u2714" : "\u25CB";
    const ev = e.evidenceRef ? ` [${e.evidenceRef}]` : "";
    return `${mark} ${e.id} (${e.kind}, ${e.status}${e.birthEpoch === s.epoch ? ", NEW" : ""})${ev}: ${e.assertion}`;
  });
  const edgeLines = s.edges.map((e) => `${e.op} ${e.from ?? "\u2205"} \u2192 ${e.to} (epoch ${e.epoch}, ${e.seat})`);
  return [...lines, ...edgeLines].join("\n");
}
async function generateParallel(ctx, parent, spec, args) {
  const seats = (args.only ?? spec.seats.map((s) => s.id)).map((id) => spec.seats.find((s) => s.id === id)).filter((s) => s !== void 0);
  const tasks = seats.map(async (seat) => {
    const prompt = args.promptBuilder(seat.id);
    const existing = args.fibers.get(seat.id);
    let fiber;
    let attempt = 0;
    let lastError = null;
    const maxAttempts = 1 + Math.min(2, 1);
    while (attempt < maxAttempts) {
      attempt++;
      try {
        if (existing !== void 0 && existing.isOffline && args.fibers.get(seat.id) === existing) {
          args.fibers.delete(seat.id);
        }
        const current = args.fibers.get(seat.id);
        if (current === void 0 || attempt > 1) {
          fiber = await startSeatFiber(ctx, parent, {
            seatId: seat.id,
            label: `${spec.id} seat: ${seat.id}`,
            persona: seat.persona,
            initialPrompt: prompt,
            denyTools: DEBATER_DENIED_TOOLS
          }, args.signal);
          args.fibers.set(seat.id, fiber);
        } else {
          fiber = current;
          await followupSeatFiber(ctx, parent, fiber, prompt, args.signal);
        }
        const text = await waitForSeatTurn(ctx, fiber.childId, args.signal, args.params.debaterTimeoutMs);
        const tokens2 = estimateTokens(text);
        fiber.totalTokens += tokens2;
        return { seatId: seat.id, text, tokens: tokens2 };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        councilDiag(`[epoch ${args.epoch}] seat ${seat.id} attempt ${attempt} failed: ${lastError.message}`);
        if (args.signal.aborted) throw lastError;
        if (attempt >= maxAttempts) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const fiberState = args.fibers.get(seat.id);
    if (fiberState !== void 0) fiberState.isOffline = true;
    return {
      seatId: seat.id,
      text: `[SEAT ERROR: ${seat.id} failed: ${lastError?.message ?? "deliberation failed"}]`,
      tokens: 0,
      error: lastError?.message ?? "deliberation failed"
    };
  });
  const settled = await Promise.allSettled(tasks);
  const turns = [];
  let tokens = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      turns.push(r.value);
      tokens += r.value.tokens;
    } else {
      turns.push({ seatId: "unknown", text: `[SEAT ERROR: ${String(r.reason)}]`, tokens: 0, error: String(r.reason) });
    }
  }
  const online = turns.filter((t) => t.error === void 0).length;
  if (seats.length === 0 || online === 0 || online / seats.length < params2Quorum(args.params)) {
    const details = turns.filter((t) => t.error !== void 0).map((t) => `${t.seatId}: ${t.error}`).join("; ");
    throw new Error(`Council failed quorum: only ${online}/${seats.length} seats responded (required ${(args.params.quorumFraction * 100).toFixed(0)}%). Errors: ${details}`);
  }
  return { turns, tokens };
}
function params2Quorum(p) {
  return p.quorumFraction;
}
async function runChair(ctx, parent, spec, input) {
  const sections = spec.deliverableSections.join(", ");
  const prompt = [
    `COUNCIL: ${spec.label}`,
    `QUERY: ${input.query}`,
    `FINAL LEDGER:
${renderLedger(input.ledger, spec)}`,
    `EVIDENCE VAULT:
${input.vault.render()}`,
    input.transcriptNote ? `NOTE: some evidence requests failed (${input.transcriptNote}) \u2014 reflect uncertainty where it matters.` : "",
    `Compile the final ${spec.label} deliverable with EXACTLY these sections: ${sections}.`,
    "Zero data loss: every ledger entry and its disposition must be reflected. Falsified paths appear with their refutations. Dissents are preserved verbatim in spirit.",
    "Output the deliverable document only \u2014 no meta commentary."
  ].filter(Boolean).join("\n\n");
  let fiber;
  try {
    fiber = await startSeatFiber(ctx, parent, {
      seatId: "chair",
      label: `council chair: ${spec.id}`,
      persona: `You are the Chair of the ${spec.label} council. You compile the final deliverable from the dispute ledger with zero data loss. You write only the deliverable document. Do not call any tools.`,
      initialPrompt: prompt,
      denyTools: DEBATER_DENIED_TOOLS
    }, input.signal);
    const text = await waitForSeatTurn(ctx, fiber.childId, input.signal, input.timeoutMs);
    return { text, tokens: estimateTokens(text) };
  } finally {
    if (fiber !== void 0) {
      try {
        await disposeSeatFibers(ctx, [fiber]);
      } catch {
      }
    }
  }
}
function computeQuality(ledger, spec) {
  const s = ledger.state();
  const terminal = new Set(spec.ledgerKinds.flatMap((k) => k.terminalStatuses));
  const cruxLike = s.entries;
  const resolved = cruxLike.filter((e) => terminal.has(e.status)).length;
  const invariants = cruxLike.filter((e) => e.status === "invariant" && e.evidenceRef !== null).length;
  const contested = cruxLike.filter((e) => e.status === "contested");
  const flippedFromOpen = cruxLike.filter((e) => e.history.some((h) => h.from === "open" && h.to === "contested")).length;
  return {
    cruxResolutionRatio: cruxLike.length > 0 ? resolved / cruxLike.length : null,
    adversarialSurvivability: cruxLike.length > 0 ? flippedFromOpen / cruxLike.length : null,
    invariantDensity: invariants,
    newClusters: spec.forestMode ? s.edges.filter((e) => e.op === "SPROUT").length : contested.length >= 0 ? null : null
  };
}

// src/profiles/chorus.ts
var VISIONARY = [
  "You are the Visionary of a brainstorm council \u2014 the 2\u20133 year horizon.",
  "You generate genuinely new directions: moonshots, what-ifs, reframings nobody proposed.",
  "Your ONLY forest operation is SPROUT (new roots) and radical BRANCH \u2014 you never converge, never prune.",
  "One idea per line: SPROUT: <title> | <rationale>. Aim for volume with a point of view."
].join("\n");
var EXPERIENCER = [
  "You are the Experiencer of a brainstorm council \u2014 ideas as lived moments.",
  "You ground concepts in daily reality: where does this idea create friction, delight, or indifference for a real user?",
  "Your ONLY forest operation is TENSION \u2014 mark where reality bites an idea \u2014 plus SPROUT for experience-driven new ideas.",
  "One operation per line: TENSION: <idea-id> | <where reality bites>. SPROUT: <title> | <rationale>."
].join("\n");
var INTEGRATOR = [
  "You are the Integrator of a brainstorm council \u2014 today's stack, buildable paths.",
  "You FUSE disparate branches into buildable architecture and BRANCH concrete near-term variants.",
  "Every FUSE must name what it combines and what it drops (simplification is a feature).",
  "One operation per line: FUSE: <idea-a> + <idea-b> | <the buildable synthesis>. BRANCH: <idea-id> | <concrete variant>."
].join("\n");
var CHORUS_SPEC = {
  id: "chorus",
  label: "Idea Chorus",
  description: "Polyphonic brainstorm over an append-only idea forest; divergence-first, saturation-stopped; delivers a lineage-tracked harvest.",
  seats: [
    { id: "visionary", label: "Visionary", persona: VISIONARY, opGates: ["SPROUT", "BRANCH"], family: "divergent" },
    { id: "experiencer", label: "Experiencer", persona: EXPERIENCER, opGates: ["TENSION", "SPROUT"], family: "empirical" },
    { id: "integrator", label: "Integrator", persona: INTEGRATOR, opGates: ["BRANCH", "FUSE"], family: "practical" }
  ],
  ledgerKinds: [
    { kind: "idea", idPrefix: "I", terminalStatuses: ["invariant"] }
  ],
  actions: ["SPROUT", "BRANCH", "FUSE", "TENSION"],
  steelman: false,
  scopeContract: "Stay on the seed vision and its adjacencies. Nothing is out of scope for divergence except direct contradictions of the seed.",
  opening: "blind",
  preflightInventory: false,
  forestMode: true,
  deliverableSections: ["Spotlight Gems (with lineage)", "Thematic Clusters", "Concept Catalog", "Buildable Now vs Moonshots", "Open Questions"]
};
var CHORUS_PARAM_DEFAULTS = {
  defaultMaxRounds: 6,
  stagnationLimit: 2,
  challengeRound: true
};

// src/profiles/roundtable.ts
var SKEPTIC = [
  "You are the Skeptic of a high-stakes architecture council \u2014 an adversarial reviewer.",
  "You hunt logic holes, unstated assumptions, failure modes, and operational realities that others gloss over.",
  "You are precise and evidence-hungry: vague claims get challenged, decisive claims get falsification attempts.",
  "You argue through the ledger: reference entries by id, propose decisive points of disagreement as PROPOSE_CRUX lines."
].join("\n");
var ARCHITECT = [
  "You are the Architect of a high-stakes architecture council \u2014 long-term shape.",
  "You reason about coupling, scalability, invariants, tech debt, and second-order consequences.",
  "You defend positions with concrete mechanics and concede cleanly when a counter is sound.",
  "You argue through the ledger: reference entries by id, propose decisive points as PROPOSE_CRUX lines."
].join("\n");
var PRAGMATIST = [
  "You are the Pragmatist of a high-stakes architecture council \u2014 ship-now bias with judgment.",
  "You flag over-engineering, unrealistic complexity, and hidden operational costs. You defend simplicity as a feature.",
  "You demand implementation feasibility: sequencing, migration paths, blast radius.",
  "You argue through the ledger: reference entries by id, propose decisive points as PROPOSE_CRUX lines."
].join("\n");
var ROUNDTABLE_SPEC = {
  id: "roundtable",
  label: "Architecture Roundtable",
  description: "Adversarial dialectic over architectural trade-offs; resolves cruxes to invariants, falsifications, or binding dissents; delivers an ADR.",
  seats: [
    { id: "skeptic", label: "Skeptic", persona: SKEPTIC, opGates: ["crux"], family: "adversarial" },
    { id: "architect", label: "Architect", persona: ARCHITECT, opGates: ["crux"], family: "systemic" },
    { id: "pragmatist", label: "Pragmatist", persona: PRAGMATIST, opGates: ["crux"], family: "practical" }
  ],
  ledgerKinds: [
    { kind: "crux", idPrefix: "C", terminalStatuses: ["invariant", "falsified", "dissent"] },
    { kind: "risk", idPrefix: "R", terminalStatuses: ["invariant", "falsified"] }
  ],
  actions: ["CONCEDE", "DEFEND", "REFRAME", "BUILD_SYNTHESIS"],
  steelman: true,
  scopeContract: "Stay on the queried decision and its direct consequences. Deployment tooling, style preferences, and hypotheticals outside the query are out of scope; the referee rules them out of order.",
  opening: "blind",
  preflightInventory: false,
  forestMode: false,
  deliverableSections: ["Decision", "Options Considered", "Evidence", "Established Invariants", "Binding Dissents", "Action Items"]
};
var ROUNDTABLE_PARAM_DEFAULTS = {
  defaultMaxRounds: 6,
  stagnationLimit: 2,
  challengeRound: true
};

// src/params.ts
var COUNCIL_PARAM_DEFAULTS = {
  maxDebateTokens: 2e5,
  defaultMaxRounds: 6,
  defaultHideLimit: true,
  quorumFraction: 2 / 3,
  debaterTimeoutMs: 3e5,
  debaterRetryCount: 1,
  consensusThreshold: 0.8,
  plateauDeltaThreshold: 0.05,
  stagnationLimit: 2,
  challengeRound: true,
  evidenceBroker: true,
  evidenceTimeoutMs: 12e4,
  blindEpoch: true,
  preflightInventory: false
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
      defaultHideLimit: bool(p.defaultHideLimit, d.defaultHideLimit),
      quorumFraction: num(p.quorumFraction, d.quorumFraction, 0.5, 1),
      debaterTimeoutMs: num(p.debaterTimeoutMs, d.debaterTimeoutMs, 1e4, 6e5),
      debaterRetryCount: num(p.debaterRetryCount, d.debaterRetryCount, 0, 3),
      consensusThreshold: num(p.consensusThreshold, d.consensusThreshold, 0.5, 1),
      plateauDeltaThreshold: num(p.plateauDeltaThreshold, d.plateauDeltaThreshold, 0.01, 0.2),
      stagnationLimit: num(p.stagnationLimit, d.stagnationLimit, 1, 6),
      challengeRound: bool(p.challengeRound, d.challengeRound),
      evidenceBroker: bool(p.evidenceBroker, d.evidenceBroker),
      evidenceTimeoutMs: num(p.evidenceTimeoutMs, d.evidenceTimeoutMs, 15e3, 6e5),
      blindEpoch: bool(p.blindEpoch, d.blindEpoch),
      preflightInventory: bool(p.preflightInventory, d.preflightInventory)
    };
  } catch {
    return d;
  }
}
function num(value, fallback, min, max) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

// src/tools.ts
function mergeParams(resolved, over) {
  return { ...resolved, ...over };
}
function qualityBlock(r) {
  const q = r.quality;
  const lines = [
    `Crux resolution: ${q.cruxResolutionRatio !== null ? `${(q.cruxResolutionRatio * 100).toFixed(0)}%` : "n/a"}`,
    `Adversarial survivability: ${q.adversarialSurvivability !== null ? `${(q.adversarialSurvivability * 100).toFixed(0)}%` : "n/a"}`,
    `Evidence-backed invariants: ${q.invariantDensity}`
  ];
  if (q.newClusters !== null) lines.push(`Distinct idea clusters: ${q.newClusters}`);
  return lines.join(" \xB7 ");
}
function registerCouncilTools(ctx, root) {
  void root;
  const busyCouncils = /* @__PURE__ */ new Set();
  ctx.tools.register({
    name: "roundtable",
    description: [
      "Run a high-stakes multi-agent architecture debate (Skeptic, Architect, Pragmatist + Referee + Chair).",
      "Blind independent formulation, steelmanned dialectic over a dispute ledger, referee adjudication with floor allocation,",
      "evidence broker for codebase/web ground truth, deterministic peak-stopping with a final challenge round.",
      "Hardcoded blocking \u2014 returns the Council Decision (ADR) with binding dissents and quality metrics.",
      "Pure deliberation: the result is an advisory report \u2014 do NOT make speculative code edits or file modifications during or immediately after this call without explicit user confirmation."
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
          description: "Safety round cap (default 6). Never announced to the seats."
        },
        hideLimit: {
          type: "boolean",
          description: "Kept for compatibility; the round cap is always hidden from the seats."
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
      render: (_args, value) => [{ type: "text", text: value.synthesis }]
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
        const resolved = mergeParams(getCouncilParams(ctx), ROUNDTABLE_PARAM_DEFAULTS);
        const result = await runCouncil(ctx, parent, {
          spec: ROUNDTABLE_SPEC,
          query: args.query,
          params: resolved,
          signal: exec.signal,
          maxRoundsOverride: args.maxRounds
        });
        const dissents = result.ledgerState.entries.filter((e) => e.status === "dissent").map((e) => `${e.id}: ${e.assertion}`);
        const consensusRatio = result.quality.cruxResolutionRatio ?? 0;
        const synthesis = [
          result.deliverable,
          "",
          "---",
          `_${result.roundsRun} epoch(s) \xB7 stop: ${result.stopReason} \xB7 ${qualityBlock(result)}_`
        ].join("\n");
        return { synthesis, roundsRun: result.roundsRun, consensusRatio, stopReason: result.stopReason, dissents };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
  ctx.tools.register({
    name: "chorus",
    description: [
      "Run a polyphonic brainstorm (Visionary, Experiencer, Integrator + Curator).",
      "Ideas grow in an append-only forest \u2014 divergence-first, nothing ever pruned \u2014 with blind independent formulation,",
      "topological-saturation stopping, and a lineage-tracked harvest.",
      "Hardcoded blocking \u2014 returns the Idea Harvest with themes, gems and provenance.",
      "Pure ideation: the result is an advisory report \u2014 do NOT make speculative code edits or file modifications during or immediately after this call without explicit user confirmation."
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
          description: "Safety round cap (default 6). Never announced to the seats."
        },
        hideLimit: {
          type: "boolean",
          description: "Kept for compatibility; the round cap is always hidden from the seats."
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
      render: (_args, value) => [{ type: "text", text: value.harvest }]
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
        const resolved = mergeParams(getCouncilParams(ctx), CHORUS_PARAM_DEFAULTS);
        const result = await runCouncil(ctx, parent, {
          spec: CHORUS_SPEC,
          query: args.query,
          params: resolved,
          signal: exec.signal,
          maxRoundsOverride: args.maxRounds
        });
        const gems = result.ledgerState.entries.slice(0, 12).map((e) => `${e.id}: ${e.assertion}`);
        const harvest = [
          result.deliverable,
          "",
          "---",
          `_${result.roundsRun} epoch(s) \xB7 stop: ${result.stopReason} \xB7 ${qualityBlock(result)}_`
        ].join("\n");
        return { harvest, roundsRun: result.roundsRun, gems, stopReason: result.stopReason };
      } finally {
        busyCouncils.delete(key);
      }
    }
  });
}

// src/index.ts
var name = "enpoi-council";
var inject = ["tools", "subagents", "sessionPersistence", "sessions", "agents"];
var PersonaModelSchema = Schema.object({
  provider: Schema.string(),
  model: Schema.string(),
  reasoningEffort: Schema.string()
});
var OrchestrationSettingsSchema = Schema.object({
  personas: Schema.dict(PersonaModelSchema).default({}),
  uiPreferences: Schema.object({
    hiddenModels: Schema.any(),
    favorites: Schema.any(),
    providerOrder: Schema.any(),
    defaultModel: Schema.any()
  }).default({})
});
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
