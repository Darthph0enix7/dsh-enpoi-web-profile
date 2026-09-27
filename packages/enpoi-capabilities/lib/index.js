var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/policy.ts
function splitCompoundCommand(command) {
  const parts = [];
  let current = "";
  let quote = null;
  let i = 0;
  while (i < command.length) {
    const ch = command[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "\n") {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      parts.push(current);
      current = "";
      i += 2;
      continue;
    }
    if (ch === ";" || ch === "|") {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
function stripEnvPrefixes(subCommand) {
  const tokens = subCommand.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? "")) i += 1;
  return i > 0 ? tokens.slice(i).join(" ") : subCommand.trim();
}
function matchBashPattern(pattern, subCommand) {
  const p = pattern.trim();
  if (p === "*") return true;
  const tokens = subCommand.split(/\s+/);
  const argv0 = tokens[0] ?? "";
  if (!p.includes(" ") && !p.includes("*")) return argv0 === p;
  if (p.endsWith("*") && !p.slice(0, -1).includes(" ")) {
    return argv0 === p.slice(0, -1);
  }
  const rx = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, (ch) => ch === "*" ? "[\\s\\S]*" : `\\${ch}`)}$`);
  return rx.test(subCommand);
}
function mcpServerNameOf(id, def) {
  return typeof def?.serverName === "string" && def.serverName !== "" ? def.serverName : id.replace(/-mcp$/, "");
}
function mcpServerSegment(toolName, knownServers) {
  if (toolName.startsWith("mcp__") && knownServers !== void 0) {
    const known = knownServers.filter((server) => server !== "" && toolName.startsWith(`mcp__${server}__`)).sort((left, right) => right.length - left.length)[0];
    if (known !== void 0) return known;
  }
  const parts = toolName.split("__");
  return parts.length >= 3 ? parts[1] : void 0;
}
function mcpLadder(toolName, table, knownServers) {
  if (table === void 0) return null;
  const check = (key) => {
    const policy = table[key];
    if (policy === void 0) return null;
    return policy === "deny" ? { kind: "deny", reason: `operator policy denies ${toolName}`, source: `matrix:${key}` } : { kind: "ask", reason: `operator policy asks for ${key}`, source: `matrix:${key}`, grantTier: "tool" };
  };
  const exact = check(toolName);
  if (exact !== null) return exact;
  const server = mcpServerSegment(toolName, knownServers);
  if (server !== void 0) {
    const hit = check(`mcp__${server}__*`);
    if (hit !== null) return hit;
  }
  if (toolName.startsWith("mcp__")) {
    const family = check("mcp__*");
    if (family !== null) return family;
  }
  return null;
}
function grantsShortCircuit(toolName, agent, grants, tier, pattern) {
  if (grants === void 0) return false;
  for (const grant of Object.values(grants)) {
    if (grant.tool !== toolName) continue;
    if (tier === "pattern") {
      if (grant.pattern !== pattern) continue;
    } else {
      if (grant.pattern !== void 0) continue;
    }
    if (grant.global !== true && grant.agent !== void 0 && grant.agent !== agent) continue;
    return true;
  }
  return false;
}
function dangerVerbOfPattern(pattern) {
  const trimmed = pattern.trim();
  if (trimmed === "" || trimmed === "*") return void 0;
  const argv0 = (trimmed.split(/\s+/)[0] ?? "").replace(/\*+$/, "");
  if (argv0 === "" || argv0.includes("/")) return void 0;
  const base = argv0.includes(".") ? argv0.slice(0, argv0.indexOf(".")) : argv0;
  return DANGER_VERB_SET.has(base) ? argv0 : void 0;
}
function patternAsk(pattern, reason, source) {
  const verb = dangerVerbOfPattern(pattern);
  return {
    kind: "ask",
    reason,
    source,
    grantTier: "pattern",
    pattern,
    ...verb !== void 0 ? { broadAllow: { label: verb } } : {}
  };
}
function decideSubCommand(sub, config, agent) {
  const agentCfg = agent !== void 0 ? config.agents?.[agent] : void 0;
  const agentPatterns = agentCfg?.bashPatterns;
  if (agentPatterns !== void 0) {
    for (const { pattern, policy } of agentPatterns) {
      if (!matchBashPattern(pattern, sub)) continue;
      if (policy === "deny") return { kind: "deny", reason: `bash rule "${pattern}" denies this command`, source: `agent pattern:${pattern}` };
      if (policy === "ask") return patternAsk(pattern, `bash rule "${pattern}" requires approval`, `agent pattern:${pattern}`);
      return { kind: "allow", source: `agent pattern:${pattern}` };
    }
  }
  const agentTool = agentCfg?.tools?.bash;
  if (agentTool !== void 0) {
    if (agentTool === "deny") return { kind: "deny", reason: `agent policy denies bash`, source: `agent:${agent}` };
    if (agentTool === "ask") return { kind: "ask", reason: `agent policy asks for bash`, source: `agent:${agent}`, grantTier: "tool" };
    return { kind: "allow", source: `agent:${agent}` };
  }
  const globalPatterns = [...config.bashPatterns ?? [], ...SHIPPED_BASH_PATTERNS];
  for (const { pattern, policy } of globalPatterns) {
    if (!matchBashPattern(pattern, sub)) continue;
    if (policy === "deny") return { kind: "deny", reason: `bash rule "${pattern}" denies this command`, source: `pattern:${pattern}` };
    if (policy === "ask") return patternAsk(pattern, `bash rule "${pattern}" requires approval`, `pattern:${pattern}`);
    return { kind: "allow", source: `pattern:${pattern}` };
  }
  const globalTool = config.tools?.bash ?? SHIPPED_TOOL_DEFAULTS.bash ?? "ask";
  if (globalTool === "deny") return { kind: "deny", reason: "operator policy denies bash", source: "matrix:global" };
  if (globalTool === "ask") return { kind: "ask", reason: "operator policy asks for bash", source: "matrix:global", grantTier: "tool" };
  return { kind: "allow", source: "matrix:global" };
}
function mcpPolicyRemovalOps(server, config) {
  const prefix = `mcp__${server}__`;
  const ops = [];
  for (const key of Object.keys(config?.tools ?? {})) {
    if (key.startsWith(prefix)) ops.push({ op: "unset", path: ["permissions", "tools", key] });
  }
  for (const [agent, agentCfg] of Object.entries(config?.agents ?? {})) {
    for (const key of Object.keys(agentCfg?.tools ?? {})) {
      if (key.startsWith(prefix)) ops.push({ op: "unset", path: ["permissions", "agents", agent, "tools", key] });
    }
  }
  return ops;
}
function agentRoleOf(agent, readCurrentPreset) {
  if (agent === void 0) return void 0;
  for (const candidate of [agent.agentPreset, agent.preset, agent.name, agent.label]) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  const session = agent.session;
  if (session !== void 0 && readCurrentPreset !== void 0) {
    try {
      const current = readCurrentPreset(session);
      if (typeof current === "string" && current !== "") return current;
    } catch {
    }
  }
  const header = session?.header;
  const created = typeof header?.agentPreset === "string" && header.agentPreset !== "" ? header.agentPreset : header?.meta?.agentPreset;
  if (typeof created === "string" && created !== "") return created;
  try {
    const events = session?.ownEvents?.() ?? [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const value = events[i]?.data?.agentPreset;
      if (events[i]?.type === "agent-preset/selected" && typeof value === "string" && value !== "") return value;
    }
  } catch {
  }
  return void 0;
}
function reviewerSeatOf(agent, readCurrentPreset) {
  const role = agentRoleOf(agent, readCurrentPreset);
  if (role !== void 0 && REVIEW_ROLES.has(role)) return true;
  const events = agent?.session?.ownEvents?.() ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "subagent/descriptor") continue;
    const label = typeof event.data?.label === "string" ? event.data.label.toLowerCase() : "";
    if (REVIEW_CHILD_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix))) return true;
    const persona = typeof event.data?.persona === "string" ? event.data.persona : "";
    return REVIEW_CHILD_PERSONA.test(persona);
  }
  return false;
}
function resolvePolicy(input) {
  const { toolName, command, sandboxMode } = input;
  const agent = input.agent ?? "(unknown)";
  if (sandboxMode === "read-only" && MUTATION_TOOLS.has(toolName)) {
    return { kind: "deny", reason: `read-only session: ${toolName} mutations are blocked`, source: "session:read-only" };
  }
  if (toolName === "bash") {
    if (command === void 0 || command.trim().length === 0) {
      return { kind: "deny", reason: "empty bash command", source: "policy:empty" };
    }
    const subs = splitCompoundCommand(command);
    if (subs.length === 0) return { kind: "deny", reason: "empty bash command", source: "policy:empty" };
    let sawAsk = null;
    let firstAllow = null;
    for (const raw of subs) {
      const sub = stripEnvPrefixes(raw);
      const subDecision = decideSubCommand(sub, input.config, agent);
      if (subDecision.kind === "deny") {
        const suffix = subs.length > 1 ? " (part of compound command)" : "";
        return { kind: "deny", reason: `${subDecision.reason}${suffix}`, source: subDecision.source };
      }
      if (subDecision.kind === "ask" && sawAsk === null) sawAsk = subDecision;
      if (subDecision.kind === "allow" && firstAllow === null) firstAllow = subDecision;
    }
    if (sawAsk !== null) {
      const who = input.agent;
      if (sawAsk.grantTier === "pattern" && sawAsk.pattern !== void 0) {
        if (sawAsk.broadAllow !== void 0 && grantsShortCircuit(toolName, who, input.config.grants, "pattern", command)) {
          return { kind: "allow", source: "grant:command" };
        }
        if (grantsShortCircuit(toolName, who, input.config.grants, "pattern", sawAsk.pattern)) {
          return { kind: "allow", source: `grant:pattern:${sawAsk.pattern}` };
        }
      }
      if (sawAsk.grantTier === "tool" && grantsShortCircuit(toolName, who, input.config.grants, "tool", void 0)) {
        return { kind: "allow", source: "grant:tool" };
      }
      return sawAsk;
    }
    const opaque = subs.map(stripEnvPrefixes).find((sub) => {
      const argv0 = sub.split(/\s+/)[0] ?? "";
      if (OPAQUE_EXECUTORS.has(argv0)) return true;
      return INLINE_INTERPRETERS.test(argv0) && /(?:^|\s)(?:-c|-e|--eval)\b/.test(sub);
    });
    if (opaque !== void 0) {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, "pattern", command)) {
        return { kind: "allow", source: "grant:command" };
      }
      return {
        kind: "ask",
        reason: `command runs ${opaque.split(/\s+/)[0]}, which can execute arbitrary code \u2014 approve explicitly; to read, decode, or search files use the read, grep, or glob tools instead`,
        source: "scan:opaque-executor",
        grantTier: "pattern",
        pattern: command
      };
    }
    if (HIDDEN_SURFACE.test(command) && DANGER_VERBS.test(command)) {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, "pattern", command)) {
        return { kind: "allow", source: "grant:command" };
      }
      return {
        kind: "ask",
        reason: "command embeds a shell expansion or wrapper containing a destructive verb \u2014 approve explicitly; to read file contents use the read tool (or grep/glob to search) instead",
        source: "scan:hidden-danger",
        grantTier: "pattern",
        pattern: command
      };
    }
    return { kind: "allow", source: firstAllow?.source ?? "policy:all-subcommands-allowed" };
  }
  if (toolName === REVIEW_RUN_TOOL) {
    return input.reviewer === true || REVIEW_ROLES.has(agent) ? { kind: "allow", source: "review:seat" } : { kind: "deny", reason: `review_run is available only to reviewer/oracle seats (role ${agent})`, source: "review:seat" };
  }
  const agentCfg = input.agent !== void 0 ? input.config.agents?.[input.agent] : void 0;
  const agentPolicy = agentCfg?.tools?.[toolName];
  if (agentPolicy !== void 0) {
    if (agentPolicy === "deny") return { kind: "deny", reason: `agent policy denies ${toolName}`, source: `agent:${agent}` };
    if (agentPolicy === "ask") {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, "tool", void 0)) {
        return { kind: "allow", source: "grant:tool" };
      }
      return { kind: "ask", reason: `agent policy asks for ${toolName}`, source: `agent:${agent}`, grantTier: "tool" };
    }
    return { kind: "allow", source: `agent:${agent}` };
  }
  const globalPolicy = input.config.tools?.[toolName] ?? SHIPPED_TOOL_DEFAULTS[toolName];
  if (globalPolicy !== void 0) {
    if (globalPolicy === "deny") return { kind: "deny", reason: `operator policy denies ${toolName}`, source: "matrix:global" };
    if (globalPolicy === "ask") {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, "tool", void 0)) {
        return { kind: "allow", source: "grant:tool" };
      }
      return { kind: "ask", reason: `operator policy asks for ${toolName}`, source: "matrix:global", grantTier: "tool" };
    }
    return { kind: "allow", source: "matrix:global" };
  }
  if (isMcpToolName(toolName)) {
    const ladder = mcpLadder(toolName, input.config.tools, input.mcpServerNames);
    if (ladder !== null) return ladder;
  }
  const fallback = input.config.defaults?.unknownTools ?? "ask";
  if (fallback === "deny") return { kind: "deny", reason: `unconfigured tool ${toolName} denied by default`, source: "defaults" };
  if (fallback === "ask") {
    if (grantsShortCircuit(toolName, input.agent, input.config.grants, "tool", void 0)) {
      return { kind: "allow", source: "grant:tool" };
    }
    return { kind: "ask", reason: `unconfigured tool ${toolName} requires approval (default)`, source: "defaults", grantTier: "tool" };
  }
  return { kind: "allow", source: "defaults" };
}
function advertisedToolNames(toolNames, approvalPolicy, input) {
  if (approvalPolicy !== "never") return [...toolNames];
  return toolNames.filter((toolName) => {
    const decision = resolvePolicy({
      toolName,
      agent: input.agent,
      config: input.config,
      sandboxMode: input.sandboxMode,
      mcpServerNames: input.mcpServerNames
    });
    return decision.kind !== "ask";
  });
}
function isMcpToolName(toolName) {
  return toolName.startsWith("mcp__");
}
function grantProposalFor(decision, toolName, command, agent) {
  if (decision.grantTier === "pattern" && decision.pattern !== void 0) {
    if (decision.broadAllow !== void 0 && command !== void 0 && command.trim() !== "") {
      return { tool: toolName, pattern: command, broadPattern: decision.pattern, agent };
    }
    return { tool: toolName, pattern: decision.pattern, agent };
  }
  return { tool: toolName, agent };
}
function grantProposalForOutcome(proposal, broad) {
  if (!broad || proposal.broadPattern === void 0) return proposal;
  return { tool: proposal.tool, pattern: proposal.broadPattern, ...proposal.agent !== void 0 ? { agent: proposal.agent } : {} };
}
function standingGrantRecord(id, proposal, createdAt) {
  return {
    id,
    tool: proposal.tool,
    ...proposal.pattern !== void 0 ? { pattern: proposal.pattern } : {},
    ...proposal.agent !== void 0 ? { agent: proposal.agent } : {},
    global: true,
    createdAt
  };
}
var MUTATION_TOOLS, REVIEW_RUN_TOOL, REVIEW_ROLES, REVIEW_CHILD_LABEL_PREFIXES, REVIEW_CHILD_PERSONA, SHIPPED_TOOL_DEFAULTS, SHIPPED_BASH_PATTERNS, HIDDEN_SURFACE, DANGER_VERBS, DANGER_VERB_SET, OPAQUE_EXECUTORS, INLINE_INTERPRETERS;
var init_policy = __esm({
  "src/policy.ts"() {
    "use strict";
    MUTATION_TOOLS = /* @__PURE__ */ new Set(["bash", "edit", "write", "str_replace_editor"]);
    REVIEW_RUN_TOOL = "review_run";
    REVIEW_ROLES = /* @__PURE__ */ new Set([
      "oracle",
      "reviewer",
      "critic",
      "referee",
      "chair",
      "skeptic",
      "architect",
      "pragmatist"
    ]);
    REVIEW_CHILD_LABEL_PREFIXES = Object.freeze([
      "oracle review:",
      "reviewer:",
      "critic:",
      "referee:",
      "chair:",
      "skeptic:",
      "architect:",
      "pragmatist:"
    ]);
    REVIEW_CHILD_PERSONA = /^you are the (?:oracle|reviewer|critic|referee|chair|skeptic|architect|pragmatist)\b/i;
    SHIPPED_TOOL_DEFAULTS = {
      read: "allow",
      glob: "allow",
      grep: "allow",
      read_image: "allow",
      web_search: "allow",
      web_fetch: "allow",
      todo_write: "allow",
      todo_read: "allow",
      memory_search: "allow",
      memory_save: "allow",
      memory_rescind: "allow",
      memory_confirm: "allow",
      oracle_review: "allow",
      request_evidence: "allow",
      roundtable: "allow",
      chorus: "allow",
      subagent: "allow",
      task: "allow",
      job_output: "allow",
      job_list: "allow",
      job_kill: "ask",
      skill: "allow",
      ask_user_question: "allow",
      // Read-only introspection: an unattended peer/driver run must be able to look
      // at its own session, diagnostics, and history without parking on an ask
      // nobody is there to answer (observed live: session_debug parked a turn).
      // Mutations keep their policy — registering a council, writing the board, or
      // any execution still asks.
      session_debug: "allow",
      diagnostics_report: "allow",
      fast_report: "allow",
      session_search: "allow",
      session_trace: "allow",
      session_event_search: "allow",
      session_event_read: "allow",
      session_event_trace: "allow",
      council_list: "allow",
      // The whiteboard is permanent core orchestrator context (doc 66 §3c/§67 §B):
      // its five per-feature asks fold into ONE family policy (the curated
      // `whiteboard_*` row in the Permissions UI, permissions-model.ts
      // POLICY_FAMILIES). Operator decision 2026-09-26 after granting read/write/
      // pin/unpin per feature; existing standing grants stay on record but are no
      // longer needed to absorb an ask.
      whiteboard_read: "allow",
      whiteboard_write: "allow",
      whiteboard_pin: "allow",
      whiteboard_unpin: "allow",
      whiteboard_forget: "allow",
      edit: "allow",
      write: "allow",
      bash: "ask",
      str_replace_editor: "ask",
      // Delivery only declares deliverables; no filesystem or network effect. An
      // unattended run must not park on the unknown-tools ask for it. Availability
      // (per-role tools.available / restrict) still gates which agents hold it.
      present: "allow"
    };
    SHIPPED_BASH_PATTERNS = [
      { pattern: "git *", policy: "allow" },
      { pattern: "rm", policy: "ask" },
      { pattern: "rm *", policy: "ask" },
      { pattern: "rmdir", policy: "ask" },
      { pattern: "rmdir *", policy: "ask" },
      { pattern: "unlink", policy: "ask" },
      { pattern: "unlink *", policy: "ask" },
      { pattern: "dd*", policy: "ask" },
      { pattern: "mkfs*", policy: "ask" },
      { pattern: "fdisk", policy: "ask" },
      { pattern: "fdisk *", policy: "ask" },
      { pattern: "shutdown", policy: "ask" },
      { pattern: "reboot", policy: "ask" },
      { pattern: "poweroff", policy: "ask" },
      { pattern: "halt", policy: "ask" },
      { pattern: "chmod -R *", policy: "ask" },
      { pattern: "chown -R *", policy: "ask" },
      // The OpenCode catch-all: every command not explicitly listed runs free.
      // Only the dangerous list above asks.
      { pattern: "*", policy: "allow" }
    ];
    HIDDEN_SURFACE = /\$\(|`|\bbash\s+-c\b|\bsh\s+-c\b|\beval\b|\bxargs\b|-exec\b|<\(|<</;
    DANGER_VERBS = /\b(?:rm|rmdir|unlink|dd|mkfs(?:\.[a-z0-9]+)?|fdisk|sfdisk|parted|shutdown|reboot|poweroff|halt|wipefs|shred|chmod|chown|mount|umount|kill|pkill|killall|truncate)\b/;
    DANGER_VERB_SET = /* @__PURE__ */ new Set([
      "rm",
      "rmdir",
      "unlink",
      "dd",
      "mkfs",
      "fdisk",
      "sfdisk",
      "parted",
      "shutdown",
      "reboot",
      "poweroff",
      "halt",
      "wipefs",
      "shred",
      "chmod",
      "chown",
      "mount",
      "umount",
      "kill",
      "pkill",
      "killall",
      "truncate"
    ]);
    OPAQUE_EXECUTORS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "eval", "source", "."]);
    INLINE_INTERPRETERS = /^(?:python[0-9.]*|perl|ruby|node|deno|bun|php)$/;
  }
});

// src/mcp-tools.ts
function isConflict(error) {
  const code = error?.code;
  return code === "SETTINGS_CONFLICT" || code === "settings/conflict";
}
function canFenceMcpWrites(settings) {
  return settings?.mutate !== void 0;
}
function mcpToolNames(names) {
  return names.filter((name2) => typeof name2 === "string" && name2.startsWith(MCP_TOOL_PREFIX)).sort((left, right) => left.localeCompare(right));
}
function registeredToolNames(names) {
  return [...new Set(names.filter((name2) => typeof name2 === "string" && name2 !== ""))].sort((left, right) => left.localeCompare(right));
}
async function removeMcpServerFenced(settings, id, ns = ORCHESTRATION_NS) {
  if (!canFenceMcpWrites(settings)) return { removed: false, rows: 0 };
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const descriptor = settings.describe?.().find((entry) => entry.ns === ns);
    const value = descriptor?.value;
    const def = (value?.mcpServers ?? {})[id];
    if (def === void 0) return { removed: false, rows: 0 };
    const server = mcpServerNameOf(id, def);
    const ops = [
      { op: "unset", path: ["mcpServers", id] },
      ...mcpPolicyRemovalOps(server, value?.permissions)
    ];
    const revision = descriptor?.revision;
    try {
      await settings.mutate(ns, ops, revision);
      return { removed: true, rows: ops.length - 1 };
    } catch (error) {
      if (isConflict(error) && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
      throw error;
    }
  }
  return { removed: false, rows: 0 };
}
var MCP_TOOL_PREFIX, ORCHESTRATION_NS, MAX_WRITE_ATTEMPTS;
var init_mcp_tools = __esm({
  "src/mcp-tools.ts"() {
    "use strict";
    init_policy();
    MCP_TOOL_PREFIX = "mcp__";
    ORCHESTRATION_NS = "enpoi-orchestration";
    MAX_WRITE_ATTEMPTS = 3;
  }
});

// src/rpc.ts
var rpc_exports = {};
__export(rpc_exports, {
  EnpoiCapabilitiesService: () => EnpoiCapabilitiesService,
  mountCapabilitiesRemote: () => mountCapabilitiesRemote
});
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
function mountCapabilitiesRemote(ctx) {
  ctx.plugin(EnpoiCapabilitiesService);
}
var _removeMcpServer_dec, _registeredTools_dec, _mcpTools_dec, _a, _init, EnpoiCapabilitiesService;
var init_rpc = __esm({
  "src/rpc.ts"() {
    "use strict";
    init_mcp_tools();
    EnpoiCapabilitiesService = class extends (_a = TypertRemoteService, _mcpTools_dec = [Remote], _registeredTools_dec = [Remote], _removeMcpServer_dec = [Remote], _a) {
      /**
       * @param ctx - owning Host Context (the Typert binding is installed by the base).
       */
      constructor(ctx) {
        super(ctx, "enpoiCapabilities");
        __runInitializers(_init, 5, this);
      }
      async mcpTools() {
        try {
          const tools = this.ctx.get("tools");
          const schemas = tools?.schemas?.() ?? [];
          return { tools: mcpToolNames(schemas.map((schema) => schema.name)) };
        } catch {
          return { tools: [] };
        }
      }
      async registeredTools() {
        try {
          const tools = this.ctx.get("tools");
          const schemas = tools?.schemas?.() ?? [];
          return { tools: registeredToolNames(schemas.map((schema) => schema.name)) };
        } catch {
          return { tools: [] };
        }
      }
      async removeMcpServer(id) {
        const settings = this.ctx.get("settings");
        return await removeMcpServerFenced(settings, id);
      }
    };
    _init = __decoratorStart(_a);
    __decorateElement(_init, 1, "mcpTools", _mcpTools_dec, EnpoiCapabilitiesService);
    __decorateElement(_init, 1, "registeredTools", _registeredTools_dec, EnpoiCapabilitiesService);
    __decorateElement(_init, 1, "removeMcpServer", _removeMcpServer_dec, EnpoiCapabilitiesService);
    __decoratorMetadata(_init, EnpoiCapabilitiesService);
  }
});

// src/index.ts
import Schema from "@deepseek-ai/schemastery";
import { readOrchestrationDocument } from "dsh-enpoi-contracts";

// src/types.ts
var PROTECTED_CAPABILITIES = /* @__PURE__ */ new Set([
  "enpoi-contracts",
  "enpoi-context-keeper",
  "enpoi-cascade",
  "enpoi-living-brief",
  "read",
  "glob",
  "grep"
]);
var KNOWN_CAPABILITIES = [
  // MCP Servers (Default OFF per user directive). Plane is the only shipped
  // MCP descriptor; the rest of the catalog is settings-owned and must not be
  // mirrored here as phantom rows.
  { id: "plane-mcp", name: "Plane MCP", kind: "mcp", category: "mcp", description: "Project management and backlog tooling", defaultEnabled: false },
  // Skills (Default ON)
  { id: "project-management", name: "Project Management", kind: "skill", category: "skills", description: "Plane documentation and progress journaling", defaultEnabled: true },
  { id: "ue-mcp", name: "UE5 Automation Skill", kind: "skill", category: "skills", description: "Unreal Engine 5 MCP workflows", defaultEnabled: true },
  { id: "tier1-workflow", name: "Tier 1 Guided Workflow", kind: "skill", category: "skills", description: "Guided planning with Oracle supervision", defaultEnabled: true },
  { id: "tier2-workflow", name: "Tier 2 Ideation Workflow", kind: "skill", category: "skills", description: "Ideation and Roundtable debate planning", defaultEnabled: true },
  { id: "tier3-workflow", name: "Tier 3 Full Workflow", kind: "skill", category: "skills", description: "Complex implementation with continuous supervision", defaultEnabled: true },
  // Subagents & Higher-Order Tools (Default ON)
  { id: "oracle_review", name: "The Oracle (Supervisor)", kind: "tool", category: "supervision", description: "Senior supervisor for architectural reviews and plan verification", defaultEnabled: true },
  { id: "roundtable", name: "Roundtable Debate", kind: "tool", category: "council", description: "Colosseum dialectic 3-way debate across Skeptic, Architect & Pragmatist", defaultEnabled: true },
  { id: "chorus", name: "Chorus Brainstorm", kind: "tool", category: "council", description: "Polyphonic brainstorming across Visionary, Experiencer & Integrator", defaultEnabled: true },
  { id: "fixer", name: "Fixer Worker", kind: "tool", category: "workers", description: "Bounded code implementation and localized bug detection", defaultEnabled: true },
  { id: "explorer", name: "Explorer Worker", kind: "tool", category: "workers", description: "Codebase mapping and structural pattern discovery", defaultEnabled: true },
  { id: "librarian", name: "Librarian Worker", kind: "tool", category: "workers", description: "External documentation research and web fetching", defaultEnabled: true },
  { id: "designer", name: "Designer Worker", kind: "tool", category: "workers", description: "UI/UX design systems, layout, and visual polish", defaultEnabled: true },
  // Core System Tools (Default ON)
  { id: "edit", name: "File Editor", kind: "tool", category: "core-tools", description: "Direct filesystem edits and string replacements", defaultEnabled: true },
  { id: "write", name: "File Writer", kind: "tool", category: "core-tools", description: "File creation and overwrite capabilities", defaultEnabled: true },
  { id: "bash", name: "Bash Terminal", kind: "tool", category: "core-tools", description: "Terminal command execution in persistent session", defaultEnabled: true },
  { id: "memory_save", name: "Memory Save", kind: "tool", category: "core-tools", description: "Store durable facts into CBDC memory.db", defaultEnabled: true },
  { id: "memory_search", name: "Memory Search", kind: "tool", category: "core-tools", description: "Semantic recall across SQLite memory.db", defaultEnabled: true }
];

// src/state.ts
function initialCapabilitiesState(globalDefaults) {
  const tools = {};
  const skills = {};
  const mcp = {};
  for (const cap of KNOWN_CAPABILITIES) {
    if (cap.kind === "tool") tools[cap.id] = cap.defaultEnabled;
    if (cap.kind === "skill") skills[cap.id] = cap.defaultEnabled;
    if (cap.kind === "mcp") mcp[cap.id] = cap.defaultEnabled;
  }
  if (globalDefaults?.tools) Object.assign(tools, globalDefaults.tools);
  if (globalDefaults?.skills) Object.assign(skills, globalDefaults.skills);
  if (globalDefaults?.mcp) Object.assign(mcp, globalDefaults.mcp);
  for (const p of PROTECTED_CAPABILITIES) {
    tools[p] = true;
  }
  return { tools, skills, mcp };
}

// src/catalog.ts
function rewriteCatalogMessage(msg, disabledSkillIds) {
  const source = msg.source;
  if (source?.kind !== "skill-catalog") return void 0;
  const content = msg.content;
  if (!Array.isArray(content)) return msg;
  const newContent = content.map((block) => {
    if (block.type !== "text" || typeof block.text !== "string") return block;
    const kept = block.text.split("\n").filter((line) => {
      const m = line.match(/^- `([^`]+)`:/);
      if (!m) return true;
      return !disabledSkillIds.has(m[1]);
    });
    return { ...block, text: kept.join("\n") };
  });
  const entries = Array.isArray(source.entries) ? source.entries.filter((entry) => !(entry !== null && typeof entry === "object" && typeof entry.name === "string" && disabledSkillIds.has(entry.name))) : source.entries;
  return {
    ...msg,
    content: newContent,
    source: { ...source, ...entries === void 0 ? {} : { entries } }
  };
}
function catalogNames(msg) {
  const entries = msg.source?.entries;
  return Array.isArray(entries) ? entries.map((entry) => String(entry.name ?? "")).join("\0") : "";
}
function filterSkillCatalogMessages(messages, disabledSkillIds, published, sessionId) {
  const filtered = [];
  let droppedUpdates = 0;
  for (const msg of messages) {
    const rewritten = rewriteCatalogMessage(msg, disabledSkillIds);
    if (rewritten === void 0) {
      filtered.push(msg);
      continue;
    }
    const names = catalogNames(rewritten);
    const isUpdate = msg.source?.update === true;
    if (isUpdate && sessionId !== "" && published.get(sessionId) === names) {
      droppedUpdates += 1;
      continue;
    }
    if (sessionId !== "") {
      if (published.size > 500) published.clear();
      published.set(sessionId, names);
    }
    filtered.push(rewritten);
  }
  return { messages: filtered, droppedUpdates };
}

// src/enforcement.ts
init_policy();
function mountedServerNames(catalog) {
  return Object.entries(catalog ?? {}).map(([id, def]) => mcpServerNameOf(id, def));
}
function catalogIdOf(segment, catalog) {
  for (const [id, def] of Object.entries(catalog ?? {})) {
    if (mcpServerNameOf(id, def) === segment) return id;
  }
  return void 0;
}
function evaluateToolCall(toolName, args, state, mcpCatalog) {
  if (PROTECTED_CAPABILITIES.has(toolName)) {
    return { allowed: true };
  }
  if (state.tools[toolName] === false) {
    return {
      allowed: false,
      syntheticResult: `[CAPABILITY_DISABLED] Tool '${toolName}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`
    };
  }
  if (toolName === "dispatch_task" && args && typeof args.subagent_type === "string") {
    const worker = args.subagent_type.toLowerCase().trim();
    if (state.tools[worker] === false) {
      return {
        allowed: false,
        syntheticResult: `[CAPABILITY_DISABLED] Subagent worker '${worker}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`
      };
    }
  }
  if (toolName === "skill" && args && typeof args.name === "string") {
    const skillName = args.name.toLowerCase().trim();
    if (state.skills[skillName] === false) {
      return {
        allowed: false,
        syntheticResult: `[SKILL_DISABLED] Skill '${skillName}' is currently disabled by operator preference for this query. Do not attempt to load it in this turn.`
      };
    }
  }
  if (toolName.startsWith("mcp__")) {
    const segment = mcpServerSegment(toolName, mountedServerNames(mcpCatalog));
    if (segment !== void 0) {
      const catalogId = catalogIdOf(segment, mcpCatalog);
      const toggleKeys = [...new Set(
        [catalogId, `${segment}-mcp`, segment].filter((key) => key !== void 0 && key !== "")
      )];
      if (toggleKeys.some((key) => state.mcp[key] === false)) {
        const suite = catalogId ?? `${segment}-mcp`;
        return {
          allowed: false,
          syntheticResult: `[CAPABILITY_DISABLED] MCP Tool suite '${suite}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`
        };
      }
    }
  }
  return { allowed: true };
}

// src/index.ts
init_policy();
init_mcp_tools();

// src/search-nudge.ts
var SEARCH_LEADING = /^\s*(?:sudo\s+)?(?:rg|grep|find|fd|ls)\b/u;
var SEARCH_NUDGE_TEXT = "Search hint: this turn has not used the grep or glob tool. For the next search, prefer grep/glob \u2014 they return structured, cheaper results than a shell search; keep bash for pipelines and anything the dedicated tools cannot express.";
function isSearchLeadingCommand(command) {
  return SEARCH_LEADING.test(command);
}
function sessionIdOf(agent) {
  const id = agent?.session?.id;
  return typeof id === "string" && id.length > 0 ? id : void 0;
}
function installSearchNudge(ctx) {
  const searchUsed = /* @__PURE__ */ new Set();
  const nudged = /* @__PURE__ */ new Set();
  const onSessionEvent = (session, event) => {
    if (event.type === "turn/start") {
      searchUsed.delete(session.id);
      nudged.delete(session.id);
      return;
    }
    if (event.type === "tool/call" && (event.data?.name === "grep" || event.data?.name === "glob")) {
      searchUsed.add(session.id);
    }
  };
  const onSessionDisposed = (session) => {
    searchUsed.delete(session.id);
    nudged.delete(session.id);
  };
  const onPostExecute = async (exec, result, next) => {
    const decision = await next();
    if (decision.kind !== "accept" || Object.hasOwn(decision, "value")) return decision;
    if (exec.name !== "bash") return decision;
    const sessionId = sessionIdOf(exec.agent);
    if (sessionId === void 0 || searchUsed.has(sessionId) || nudged.has(sessionId)) return decision;
    const command = exec.arguments?.command;
    if (typeof command !== "string" || !isSearchLeadingCommand(command)) return decision;
    nudged.add(sessionId);
    const accepted = decision;
    return {
      kind: "accept",
      content: [...accepted.content ?? result.content, { type: "text", text: SEARCH_NUDGE_TEXT }]
    };
  };
  ctx.on("session/event", onSessionEvent);
  ctx.on("session/disposed", onSessionDisposed);
  ctx.on("tools/post-execute", onPostExecute);
}

// src/review-run.ts
init_policy();
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
var REVIEW_RUN_DEFAULT_TIMEOUT_MS = 12e4;
var REVIEW_RUN_MAX_TIMEOUT_MS = 6e5;
var REVIEW_RUNNERS = Object.freeze({
  pytest: {
    argv: ["python3", "-m", "pytest", "-q"],
    target: true,
    interpreterCandidates: [".venv/bin/python", "venv/bin/python"]
  },
  vitest: { argv: ["npx", "--no-install", "vitest", "run"], target: true },
  jest: { argv: ["npx", "--no-install", "jest"], target: true },
  "node-test": { argv: ["node", "--test"], target: true },
  "go-test": { argv: ["go", "test"], target: true, defaultTarget: "./..." },
  "cargo-test": { argv: ["cargo", "test", "--quiet"], target: true }
});
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
function shellToken(value) {
  return /^[A-Za-z0-9_./@+-]+$/.test(value) ? value : shellQuote(value);
}
var REVIEW_RUN_SPEC_RELATIVE_PATH = ".dsh/review-run.json";
function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function readReviewRunnerOverride(workspaceRoot, runner) {
  const specPath = join(workspaceRoot, REVIEW_RUN_SPEC_RELATIVE_PATH);
  let raw;
  try {
    raw = readFileSync(specPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw new Error(`review-run spec ${specPath} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`review-run spec ${specPath} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`review-run spec ${specPath} must be a JSON object of runner \u2192 { interpreter, env? }`);
  }
  const table = parsed;
  const unknownRunners = Object.keys(table).filter((key) => !Object.hasOwn(REVIEW_RUNNERS, key));
  if (unknownRunners.length > 0) {
    throw new Error(`review-run spec ${specPath} names unknown runner(s): ${unknownRunners.join(", ")}`);
  }
  const entry = table[runner];
  if (entry === void 0) return void 0;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error(`review-run spec ${specPath}: ${runner} must be an object`);
  }
  const fields = entry;
  const unknownFields = Object.keys(fields).filter((key) => key !== "interpreter" && key !== "env");
  if (unknownFields.length > 0) {
    throw new Error(`review-run spec ${specPath}: ${runner} has unknown field(s): ${unknownFields.join(", ")}`);
  }
  const interpreter = fields["interpreter"];
  if (typeof interpreter !== "string" || !isAbsolute(interpreter)) {
    throw new Error(`review-run spec ${specPath}: ${runner}.interpreter must be an absolute path`);
  }
  if (!isExecutableFile(interpreter)) {
    throw new Error(`review-run spec ${specPath}: ${runner}.interpreter is not an executable file: ${interpreter}`);
  }
  let env;
  const rawEnv = fields["env"];
  if (rawEnv !== void 0) {
    if (typeof rawEnv !== "object" || rawEnv === null || Array.isArray(rawEnv)) {
      throw new Error(`review-run spec ${specPath}: ${runner}.env must be an object of NAME \u2192 value`);
    }
    env = {};
    for (const [name2, value] of Object.entries(rawEnv)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name2)) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env has an invalid name: ${JSON.stringify(name2)}`);
      }
      if (name2.startsWith("DSH_")) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env may not set managed ${name2}`);
      }
      if (name2.startsWith("LD_") || name2.startsWith("DYLD_")) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env may not set dynamic-loader ${name2}`);
      }
      if (typeof value !== "string" || value.includes("\0")) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env.${name2} must be a string`);
      }
      env[name2] = value;
    }
  }
  return { interpreter, ...env === void 0 ? {} : { env } };
}
function resolveReviewInterpreter(workspaceRoot, spec, override) {
  if (override !== void 0) return override.interpreter;
  for (const candidate of spec.interpreterCandidates ?? []) {
    const path = join(workspaceRoot, candidate);
    if (isExecutableFile(path)) return path;
  }
  return spec.argv[0] ?? "sh";
}
function validateReviewTarget(target) {
  const trimmed = target.trim();
  if (trimmed === "" || trimmed.startsWith("/") || trimmed.includes("\\")) {
    throw new Error("target must be a non-empty workspace-relative path");
  }
  if (!/^[A-Za-z0-9_./@+-]+$/.test(trimmed) || trimmed.split("/").includes("..")) {
    throw new Error("target may contain only letters, digits, and _.-/@+, with no `..` segment");
  }
  return trimmed;
}
function buildReviewRunCommand(runner, target, workspaceRoot, override) {
  const spec = REVIEW_RUNNERS[runner];
  if (spec === void 0) {
    throw new Error(`unknown runner "${runner}" (available: ${Object.keys(REVIEW_RUNNERS).join(", ")})`);
  }
  const resolved = target === void 0 || target.trim() === "" ? spec.defaultTarget : validateReviewTarget(target);
  const argv = [...spec.argv];
  if (workspaceRoot !== void 0) argv[0] = shellToken(resolveReviewInterpreter(workspaceRoot, spec, override));
  if (resolved !== void 0) argv.push(shellQuote(resolved));
  return argv.join(" ");
}
function reviewRunEnv(override) {
  return { PYTHONDONTWRITEBYTECODE: "1", ...override?.env };
}
function reviewRunTimeoutMs(timeoutSeconds) {
  if (timeoutSeconds === void 0 || !Number.isFinite(timeoutSeconds)) return REVIEW_RUN_DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(timeoutSeconds) * 1e3, 1e3), REVIEW_RUN_MAX_TIMEOUT_MS);
}
function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}
function reviewRunSummary(stdout) {
  const lines = stripAnsi(stdout).split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (/\d+\s+(?:passed|failed|error|errors|skipped|xfailed|xpassed|deselected|warnings?)\b/.test(line)) {
      return line.length > 200 ? `${line.slice(0, 200)}\u2026` : line;
    }
  }
  return void 0;
}
function renderReviewRun(_args, value) {
  const run = value;
  const lines = [`review_run ${run.runner}: ${run.command}`];
  if (run.error !== void 0) lines.push(run.error);
  if (run.stdout !== "") lines.push(run.stdout.trimEnd());
  if (run.stderr !== "") lines.push(`[stderr]
${run.stderr.trimEnd()}`);
  if (run.sandbox?.denied === true) {
    lines.push(`[sandbox: file access denied under ${run.sandbox.mode} mode]`);
  }
  if (run.timedOut) lines.push(`[timed out after the review-run budget]`);
  if (run.exitCode !== null) lines.push(`[exit code: ${String(run.exitCode)}]`);
  else if (run.signal !== null) lines.push(`[killed by signal: ${run.signal}]`);
  const summary = reviewRunSummary(run.stdout);
  if (summary !== void 0) lines.push(`[summary: ${summary}]`);
  return [{ type: "text", text: lines.join("\n") }];
}
var REVIEW_RUN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    runner: { type: "string" },
    command: { type: "string" },
    exitCode: { oneOf: [{ type: "number" }, { type: "null" }] },
    signal: { oneOf: [{ type: "string" }, { type: "null" }] },
    timedOut: { type: "boolean" },
    sandbox: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string" },
            denied: { type: "boolean" }
          },
          required: ["mode", "denied"]
        },
        { type: "null" }
      ]
    },
    stdout: { type: "string" },
    stderr: { type: "string" },
    error: { type: "string" }
  },
  required: ["runner", "command", "exitCode", "signal", "timedOut", "sandbox", "stdout", "stderr"]
};
function installReviewRunTool(ctx) {
  ctx.inject(["shell", "tools"], (scope) => {
    const shell = scope.get("shell");
    const policyService = scope.get("sandboxPolicy");
    if (shell === void 0 || shell.sandboxMode === void 0 || policyService === void 0) {
      process.stderr.write("[enpoi-capabilities] review_run not registered: no confining executor/sandbox policy\n");
      return;
    }
    scope.tools.register({
      name: REVIEW_RUN_TOOL,
      description: [
        "Run the workspace test suite READ-ONLY against the checkout: a fixed runner (pytest/vitest/jest/node-test/go-test/cargo-test),",
        "an optional workspace-relative target, a timeout, and no free shell. The command executes in the",
        "workspace root while the writable roots stay a private scratch directory plus the platform temp areas,",
        "so the checkout cannot be mutated; runner stderr may still show checkout cache writes denied, and network",
        "access is not blocked. A workspace `.dsh/review-run.json` may pin the",
        "runner interpreter (absolute executable path) and extra env (e.g. PYTHONPATH=src). Available to",
        "reviewer/oracle seats only."
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          runner: {
            type: "string",
            enum: Object.keys(REVIEW_RUNNERS),
            description: "The fixed test runner to invoke."
          },
          target: {
            type: "string",
            description: "Optional workspace-relative path or filter passed to the runner (no absolute paths, no `..`)."
          },
          timeoutSeconds: {
            type: "number",
            description: `Wall-clock budget in seconds (default ${String(REVIEW_RUN_DEFAULT_TIMEOUT_MS / 1e3)}, max ${String(REVIEW_RUN_MAX_TIMEOUT_MS / 1e3)}).`
          }
        },
        required: ["runner"]
      },
      output: { schema: REVIEW_RUN_OUTPUT_SCHEMA, render: renderReviewRun },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const request = args ?? {};
        const runner = typeof request.runner === "string" ? request.runner : "";
        const value = {
          runner,
          command: "",
          exitCode: null,
          signal: null,
          timedOut: false,
          sandbox: { mode: "read-only", denied: false },
          stdout: "",
          stderr: ""
        };
        try {
          if (!reviewerSeatOf(exec.agent)) {
            throw new Error("review_run is available only to reviewer/oracle seats");
          }
          const timeoutMs = reviewRunTimeoutMs(
            typeof request.timeoutSeconds === "number" ? request.timeoutSeconds : void 0
          );
          const standing = policyService.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
          if (standing.mode === "read-only") {
            throw new Error("review_run needs a writable temporary area, and this session runs read-only");
          }
          const override = readReviewRunnerOverride(standing.workspaceRoot, runner);
          value.command = buildReviewRunCommand(
            runner,
            typeof request.target === "string" ? request.target : void 0,
            standing.workspaceRoot,
            override
          );
          const scratchRoot = mkdtempSync(join(tmpdir(), "review-run-"));
          try {
            const sandboxPolicy = { ...standing, mode: "workspace-write", workspaceRoot: scratchRoot };
            const execution = await shell.execute(shell.resolve({
              command: value.command,
              workdir: standing.workspaceRoot,
              timeoutMs,
              signal: exec.signal,
              env: reviewRunEnv(override),
              sandboxPolicy
            }));
            const result = await execution.result();
            value.exitCode = result.exitCode;
            value.signal = result.signal;
            value.timedOut = result.timedOut;
            value.stdout = result.stdout.text;
            value.stderr = result.stderr.text;
            value.sandbox = { mode: result.sandbox?.mode ?? "workspace-write", denied: result.sandbox?.denied ?? false };
            return value;
          } finally {
            rmSync(scratchRoot, { recursive: true, force: true });
          }
        } catch (error) {
          value.error = `review_run could not execute: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
          return value;
        }
      }
    });
  });
}

// src/forwarding.ts
init_policy();
import { isAbsolute as isAbsolute2, relative, resolve as resolvePath } from "node:path";
var FORWARDED_ASK_MARKER = "[forwarded child ask]";
var PATH_ARG_KEYS = [
  "file_path",
  "filePath",
  "path",
  "paths",
  "target",
  "destination",
  "source",
  "file",
  "dir",
  "directory"
];
var CREDENTIAL_PATH = /(?:^|[\s/'"=@])\.env(?:\.|$|\s)|(?:^|[\s/'"=])\.ssh(?:\/|[\s'"]|$)|id_(?:rsa|ed25519|ecdsa)\b|\.pem\b|(?:^|[\s/'"=])\.netrc\b|(?:^|[\s/'"=])\.aws(?:\/|[\s'"]|$)|(?:^|[\s/'"=])\.git-credentials\b|(?:^|[\s/'"=])known_hosts\b|(?:^|[\s/'"=])credentials(?:\.json)?(?:\s|$)|\/\.config\/gcloud\/|\/\.kube\/config\b|\/\.docker\/config\.json\b|\/\.npmrc\b/i;
var PRIVILEGE_ESCALATORS = /* @__PURE__ */ new Set(["sudo", "su", "doas", "pkexec"]);
var EXFILTRATORS = /* @__PURE__ */ new Set(["scp", "sftp", "ftp", "lftp", "nc", "ncat", "socat", "telnet", "sshpass"]);
var FS_PATH_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "read_image",
  "read_image_file",
  "write",
  "edit",
  "str_replace_editor",
  "list_dir",
  "delete",
  "move",
  "copy"
]);
function shortId(id) {
  return id.length > 8 ? id.slice(0, 8) : id;
}
function delegatedChildOf(agent) {
  const header = agent?.session?.header;
  const childSessionId = typeof header?.id === "string" && header.id !== "" ? header.id : void 0;
  const parentSessionId = typeof header?.parentSession === "string" && header.parentSession !== "" ? header.parentSession : void 0;
  if (childSessionId === void 0 || parentSessionId === void 0) return void 0;
  const rawDepth = header?.delegationDepth;
  const depth = typeof rawDepth === "number" && Number.isSafeInteger(rawDepth) && rawDepth > 0 ? rawDepth : 1;
  let label;
  for (const event of agent?.session?.ownEvents?.() ?? []) {
    if (event?.type !== "subagent/descriptor") continue;
    if (typeof event.data?.label === "string" && event.data.label.trim() !== "") label = event.data.label.trim();
    break;
  }
  const cwd = typeof header?.cwd === "string" && header.cwd !== "" ? header.cwd : void 0;
  return {
    childSessionId,
    parentSessionId,
    depth,
    label: label ?? `child ${shortId(childSessionId)}`,
    ...cwd !== void 0 ? { cwd } : {}
  };
}
function pathArguments(args) {
  if (args === void 0) return [];
  const found = [];
  for (const key of PATH_ARG_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value !== "") found.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string" && item !== "") found.push(item);
    }
  }
  return found;
}
function isOutsideWorkspace(path, cwd) {
  if (cwd === void 0 || cwd === "") return false;
  const absolute = isAbsolute2(path) ? path : resolvePath(cwd, path);
  const rel = relative(cwd, absolute);
  return rel === ".." || rel.startsWith(`..${"/"}`) || isAbsolute2(rel);
}
function isRecursiveDelete(argv) {
  const argv0 = argv[0];
  if (argv0 === "rmdir") return true;
  return argv.slice(1).some((token) => {
    if (token === "--") return false;
    if (token.startsWith("--")) return token === "--recursive" || token === "--force";
    return token.startsWith("-") && /[rRf]/.test(token.slice(1));
  });
}
function isHistoryRewrite(argv) {
  const sub = argv[1];
  if (sub === "push") {
    return argv.slice(2).some((token) => token === "-f" || token === "--force" || token === "--force-with-lease" || token === "--force-if-includes" || token === "--mirror" || token === "--delete" || token.startsWith("--force-with-lease="));
  }
  if (sub === "reset") return argv.includes("--hard");
  return sub === "filter-branch" || sub === "filter-repo";
}
function isRemoteTarget(token) {
  if (token.includes("://") || token.startsWith("/") || token.startsWith("-")) return false;
  return /^[^/][^:]*:.+/.test(token);
}
function isPipeToShell(command) {
  if (/\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh(?:\s|$)/.test(command)) return true;
  if (/\|\s*(?:python[0-9.]*|perl|ruby|node|deno|bun|php)(?:\s|$)/.test(command)) return true;
  return /(?:ba|z|da|k)?sh\s+<\(|(?:python[0-9.]*|node)\s+<\(/.test(command);
}
function railOfBash(command) {
  if (isPipeToShell(command)) return { rail: "pipe-to-shell", evidence: command.trim() };
  const credential = CREDENTIAL_PATH.exec(command);
  if (credential !== null) return { rail: "credentials", evidence: credential[0] };
  for (const rawSub of splitCompoundCommand(command)) {
    const sub = stripEnvPrefixes(rawSub).trim();
    if (sub === "") continue;
    const argv = sub.split(/\s+/);
    const argv0 = argv[0] ?? "";
    if (PRIVILEGE_ESCALATORS.has(argv0)) return { rail: "privilege-escalation", evidence: sub };
    if ((argv0 === "rm" || argv0 === "rmdir") && isRecursiveDelete(argv)) return { rail: "recursive-delete", evidence: sub };
    if (argv0 === "find" && /(?:^|\s)(?:-delete|-exec\s+rm\b)/.test(sub)) return { rail: "recursive-delete", evidence: sub };
    if (argv0 === "rsync" && /(?:^|\s)--delete\b/.test(sub)) return { rail: "recursive-delete", evidence: sub };
    if (argv0 === "git" && isHistoryRewrite(argv)) return { rail: "history-rewrite", evidence: sub };
    if (EXFILTRATORS.has(argv0)) return { rail: "exfiltration", evidence: sub };
    if (argv0 === "rsync" && argv.slice(1).some(isRemoteTarget)) return { rail: "exfiltration", evidence: sub };
    if (argv0 === "curl" && argv.slice(1).some((token) => token === "-T" || token === "--upload-file" || token.startsWith("--upload-file="))) {
      return { rail: "exfiltration", evidence: sub };
    }
    if (argv0 === "wget" && argv.slice(1).some((token) => token === "--post-file" || token === "--body-file")) {
      return { rail: "exfiltration", evidence: sub };
    }
    if ((argv0 === "docker" || argv0 === "podman") && argv[1] === "push") return { rail: "exfiltration", evidence: sub };
  }
  return void 0;
}
function railHitOf(input) {
  if (input.toolName === "bash") {
    const command = typeof input.args?.command === "string" ? input.args.command : void 0;
    return command === void 0 || command.trim() === "" ? void 0 : railOfBash(command);
  }
  if (!FS_PATH_TOOLS.has(input.toolName)) return void 0;
  for (const path of pathArguments(input.args)) {
    if (CREDENTIAL_PATH.test(path)) return { rail: "credentials", evidence: path };
    if (isOutsideWorkspace(path, input.cwd)) return { rail: "boundary", evidence: path };
  }
  return void 0;
}
function recommendationOf(input) {
  const paths = input.toolName === "bash" ? [] : pathArguments(input.args);
  if (paths.length === 0) return "no filesystem path named";
  return "inside the workspace, looks safe";
}
function forwardedAskReason(origin, decision, recommendation) {
  return `${FORWARDED_ASK_MARKER} ${decision.reason}. Origin session ${shortId(origin.childSessionId)}, agent ${origin.label}, depth ${origin.depth}, matched rule ${decision.source}. Parent recommendation: ${recommendation}.`;
}
function forwardedAskDisplayReason(origin, decision, recommendation) {
  return {
    en: `Forwarded from ${origin.label} (depth ${origin.depth}): ${decision.reason}. ${recommendation}.`,
    zh: `\u6765\u81EA ${origin.label} \u7684\u8F6C\u53D1\u8BF7\u6C42\uFF08\u6DF1\u5EA6 ${origin.depth}\uFF09\uFF1A${decision.reason}\u3002${recommendation}\u3002`
  };
}
var ChildApprovalForwarder = class {
  constructor(deps) {
    this.deps = deps;
  }
  grants = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  /**
   * Resolve one child ask through the parent. Rails run first and are never
   * card-approvable; then an existing subtree grant; then the root's mode
   * (standing consent / card / fail closed). A rejection is returned as a
   * corrective deny; nothing here kills the child.
   * @param input - the child agent, tool call, and the ask the child's policy produced.
   * @returns the allow/deny resolution for the pre-execute listener.
   */
  async forward(input) {
    const child = delegatedChildOf(input.agent);
    if (child === void 0) {
      this.deps.report(`deny: non-child ask for ${input.toolName} reached the child forwarder`);
      return { kind: "deny", reason: `child approval forwarding received a non-child ask for ${input.toolName}` };
    }
    const root = this.deps.findRoot(child.childSessionId);
    if (root === void 0) {
      return this.failClosed(child.childSessionId, input.toolName, "no live parent session to forward to");
    }
    const origin = { ...child, rootSessionId: root.id };
    const depthCap = this.deps.depthCap();
    if (child.depth > depthCap) {
      this.deps.report(`deny: ${input.toolName} from child ${shortId(child.childSessionId)} at depth ${child.depth} exceeds cap ${depthCap}`);
      return {
        kind: "deny",
        reason: `approval for ${input.toolName} was denied: delegation depth ${child.depth} is past the cap ${depthCap}, so this ask is never forwarded to a human card`
      };
    }
    const command = input.toolName === "bash" && typeof input.args?.command === "string" ? input.args.command : void 0;
    const rail = railHitOf({ toolName: input.toolName, args: input.args, cwd: child.cwd });
    if (rail !== void 0) {
      const allowed = this.deps.parentAllowsRail({ root, toolName: input.toolName, ...command !== void 0 ? { command } : {}, rail: rail.rail });
      this.deps.report(
        `${allowed ? "allow" : "deny"}: rail ${rail.rail} (${rail.evidence}) from child ${shortId(child.childSessionId)} resolved through the parent's own policy`
      );
      if (allowed) return { kind: "allow", reason: `rail ${rail.rail}: the parent's own policy allows this action` };
      return {
        kind: "deny",
        reason: `approval for ${input.toolName} was denied: ${rail.rail} (${rail.evidence}) is never approvable from a forwarded child card and the parent's own policy does not allow it`
      };
    }
    const proposal = grantProposalFor(input.decision, input.toolName, command, child.label);
    if (this.grantAllows(child.childSessionId, input.decision, proposal)) {
      this.deps.report(`allow: ${input.toolName} absorbed by a grant scoped to child session ${shortId(child.childSessionId)}`);
      return { kind: "allow", reason: "allowed by a standing grant scoped to this child session" };
    }
    const mode = this.deps.modeOf(root);
    if (mode === "full-access") {
      this.deps.report(
        `allow: standing consent (root ${shortId(root.id)} is Full access / no restrictions) for ${input.toolName} from child ${shortId(child.childSessionId)}`
      );
      return { kind: "allow", reason: "approved by the parent session's Full access standing consent" };
    }
    if (mode !== "interactive") {
      return this.failClosed(
        child.childSessionId,
        input.toolName,
        mode === void 0 ? "parent session mode is unknown" : "parent runs unattended with approval prompts disabled"
      );
    }
    const recommendation = recommendationOf({ toolName: input.toolName, args: input.args, cwd: child.cwd });
    const batchKey = `${child.childSessionId}\0${input.toolName}\0${command ?? stableJson(input.args)}`;
    const inFlight = this.pending.get(batchKey);
    if (inFlight !== void 0) return await inFlight;
    const run = this.askThroughCard(input, root, origin, proposal, recommendation);
    this.pending.set(batchKey, run);
    try {
      return await run;
    } finally {
      this.pending.delete(batchKey);
    }
  }
  /** Forward the ask as one root-session card and map its outcome. */
  async askThroughCard(input, root, origin, proposal, recommendation) {
    const reason = forwardedAskReason(origin, input.decision, recommendation);
    let outcome;
    try {
      outcome = await this.deps.askRoot({
        root,
        toolName: input.toolName,
        reason,
        displayReason: forwardedAskDisplayReason(origin, input.decision, recommendation),
        ...input.decision.broadAllow !== void 0 ? { broadAllow: input.decision.broadAllow } : {},
        ...input.signal !== void 0 ? { signal: input.signal } : {},
        origin
      });
    } catch (error) {
      return this.failClosed(
        origin.childSessionId,
        input.toolName,
        `the forwarded ask could not be delivered: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    switch (outcome) {
      case "allowed-once":
        this.deps.report(`allow: human approved ${input.toolName} once for child ${shortId(origin.childSessionId)}`);
        return { kind: "allow", reason: "approved once on the forwarded parent card" };
      case "allowed-always":
        this.recordGrant(origin.childSessionId, proposal);
        this.deps.report(`allow: exact-command always granted to child session ${shortId(origin.childSessionId)}`);
        return { kind: "allow", reason: "approved with a standing grant scoped to this child session" };
      case "allowed-always-broad": {
        let confirm;
        try {
          confirm = await this.deps.askRoot({
            root,
            toolName: input.toolName,
            reason: `${FORWARDED_ASK_MARKER} second confirmation: grant "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}" as a standing allowance for child ${shortId(origin.childSessionId)} (${origin.label}, depth ${origin.depth})?`,
            displayReason: {
              en: `Confirm a broad standing grant to ${origin.label} (depth ${origin.depth}) for "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}".`,
              zh: `\u8BF7\u518D\u6B21\u786E\u8BA4\u5411 ${origin.label}\uFF08\u6DF1\u5EA6 ${origin.depth}\uFF09\u6388\u4E88 "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}" \u7684\u957F\u671F\u8BB8\u53EF\u3002`
            },
            secondConfirmation: true,
            ...input.signal !== void 0 ? { signal: input.signal } : {},
            origin
          });
        } catch (error) {
          return this.failClosed(
            origin.childSessionId,
            input.toolName,
            `the broad-grant confirmation could not be delivered: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        if (confirm === "allowed-once" || confirm === "allowed-always" || confirm === "allowed-always-broad") {
          this.recordGrant(origin.childSessionId, grantProposalForOutcome(proposal, true));
          this.deps.report(`allow: broad grant confirmed for child session ${shortId(origin.childSessionId)}`);
          return { kind: "allow", reason: "approved with a confirmed broad grant scoped to this child session" };
        }
        return {
          kind: "deny",
          reason: `the broad standing grant for ${input.toolName} was not confirmed`
        };
      }
      case "rejected":
        this.deps.report(`deny: human rejected ${input.toolName} for child ${shortId(origin.childSessionId)}`);
        return {
          kind: "deny",
          reason: `the user rejected ${input.toolName}; it required approval because: ${input.decision.reason}`
        };
      case "cancelled":
        return { kind: "deny", reason: `approval for ${input.toolName} was cancelled before it was answered` };
      case "unavailable":
        return this.failClosed(origin.childSessionId, input.toolName, "the forwarded ask was left unanswered");
      default:
        return this.failClosed(origin.childSessionId, input.toolName, `unexpected approval outcome ${String(outcome)}`);
    }
  }
  /** Fail closed with a quiet notification; the child's turn settles normally. */
  failClosed(childSessionId, toolName, why) {
    this.deps.report(`fail-closed: ${toolName} from child ${shortId(childSessionId)}: ${why}`);
    return {
      kind: "deny",
      reason: `approval for ${toolName} failed closed: ${why}. Adapt the task or report the limitation instead of retrying.`
    };
  }
  /** Whether an earlier forwarded "always" covers this ask for this child session. */
  grantAllows(childSessionId, decision, proposal) {
    const grants = this.grants.get(childSessionId);
    if (grants === void 0) return false;
    for (const grant of grants) {
      if (grant.proposal.tool !== proposal.tool) continue;
      if (grant.proposal.pattern === proposal.pattern) return true;
      if (grant.proposal.pattern !== void 0 && grant.proposal.pattern === decision.pattern) return true;
    }
    return false;
  }
  /** Record one grant against the requester's own session (deduplicated). */
  recordGrant(childSessionId, proposal) {
    const grants = this.grants.get(childSessionId) ?? [];
    if (!grants.some((grant) => grant.proposal.tool === proposal.tool && grant.proposal.pattern === proposal.pattern)) {
      grants.push({ proposal, admittedAt: Date.now() });
      this.grants.set(childSessionId, grants);
    }
  }
};
function stableJson(value) {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "<unserializable>";
  }
}

// src/index.ts
var publishedCatalog = /* @__PURE__ */ new Map();
var name = "enpoi-capabilities";
var inject = ["tools", "systemPrompt", "settings", "timer"];
var ORCH_NS = "enpoi-orchestration";
function live(schema) {
  return schema.volatile?.() ?? schema;
}
var CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({})
});
var OrchestrationSettingsSchema = Schema.object({
  capabilities: live(CapabilitiesSchema.default({})),
  mcpServers: live(Schema.dict(Schema.any()).default({})),
  mcpStatus: live(Schema.dict(Schema.any()).default({})),
  personas: live(Schema.dict(Schema.any()).default({})),
  // Operator-defined specialist roles and councils (doc 59): declared here so
  // the namespace contract is explicit rather than relying on unknown-key
  // survival — both remain opaque plugin-owned vocabularies.
  roles: live(Schema.dict(Schema.any()).default({})),
  councils: live(Schema.dict(Schema.any()).default({})),
  // Operator-defined model failover chains (doc 60): id → { label?, links,
  // attempts?, onCut?, disabled? }. Owned by enpoi-model-chains, declared here
  // so the namespace contract admits the key rather than relying on
  // unknown-key survival.
  chains: live(Schema.dict(Schema.any()).default({})),
  // Dynamic catalogue rules (doc 82 §E5): privacy seed, visibility hide rules,
  // manual overrides. Owned by dsh-enpoi-catalog-rules and declared here so the
  // namespace contract admits the key rather than relying on unknown-key survival.
  catalogRules: live(Schema.dict(Schema.any()).default({})),
  parameters: live(Schema.dict(Schema.any()).default({})),
  // UI preferences (favorites, hidden models, model assignments, …) shared by
  // every client through `settings/document-updated`. The whole record stays
  // opaque so sibling keys survive the form projection.
  uiPreferences: live(Schema.dict(Schema.any()).default({})),
  permissions: live(Schema.dict(Schema.any()).default({})),
  // Pinned whiteboard (doc 66 §3c / doc 67 §B): orchestrator-authored
  // core-context board, owned by enpoi-whiteboard and rendered into every
  // runtime-context snapshot. Declared so the namespace contract admits the
  // key rather than relying on unknown-key survival.
  whiteboard: live(Schema.dict(Schema.any()).default({})),
  // Tool-group overrides (doc 80): `groups.<id>.enabled` and
  // `seats.<seat>.preAttach`. Declared so the namespace contract admits the
  // key; the shipped group catalog lives in dsh-enpoi-tool-groups.
  toolGroups: live(Schema.dict(Schema.any()).default({}))
});
var Config = OrchestrationSettingsSchema;
async function pruneRemovedMcpPolicyRows(settings, servers, readConfig) {
  if (!canFenceMcpWrites(settings) || servers.length === 0) return 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ops = servers.flatMap((server) => mcpPolicyRemovalOps(server, readConfig()));
    if (ops.length === 0) return 0;
    const revision = settings.describe?.().find((entry) => entry.ns === ORCH_NS)?.revision;
    try {
      await settings.mutate(ORCH_NS, ops, revision);
      return ops.length;
    } catch (error) {
      const conflict = error;
      if ((conflict?.code === "SETTINGS_CONFLICT" || conflict?.code === "settings/conflict") && attempt < 2) continue;
      throw error;
    }
  }
  return 0;
}
function apply(ctx, config = {}) {
  try {
    const settingsApi = ctx.get("settings");
    settingsApi?.register?.(ORCH_NS, OrchestrationSettingsSchema, { base: { capabilities: {} } });
  } catch (error) {
    process.stderr.write(`[enpoi-capabilities] namespace registration failed: ${String(error)}
`);
  }
  ctx.inject(["settings"], (child) => {
    child.effect(() => {
      const settings = child.get("settings");
      return settings?.configure?.({ auto: false }, ctx.fiber);
    });
  });
  function documentValue(field, key) {
    const ref = field;
    if (typeof ref?.get === "function") return ref.get();
    const document = readOrchestrationDocument(ctx.get("settings"));
    return document?.[key];
  }
  function getGlobalDefaults() {
    try {
      return documentValue(config.capabilities, "capabilities");
    } catch {
      return void 0;
    }
  }
  void Promise.resolve().then(() => (init_rpc(), rpc_exports)).then((remote) => {
    try {
      remote.mountCapabilitiesRemote(ctx);
    } catch (error) {
      process.stderr.write(`[enpoi-capabilities] capabilities remote mount failed: ${String(error)}
`);
    }
  }).catch(() => {
  });
  const disposeGuard = ctx.tools.guard((exec) => {
    const decision = evaluateToolCall(exec.name, exec.arguments, initialCapabilitiesState(getGlobalDefaults()), readMcpCatalogDefs());
    if (!decision.allowed) {
      return decision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.`;
    }
    return void 0;
  });
  ctx.effect(() => disposeGuard, "enpoi-capabilities: tool guard");
  const disposeAssemble = ctx.on("system-prompt/assemble", (async (_assembly, context, next) => {
    const assembled = await next();
    if (!Array.isArray(assembled.tools) || assembled.tools.length === 0) return assembled;
    const state = initialCapabilitiesState(getGlobalDefaults());
    const disabled = new Set(
      Object.entries(state.tools).filter(([id, enabled]) => !enabled && !PROTECTED_CAPABILITIES.has(id)).map(([id]) => id)
    );
    let kept = disabled.size === 0 ? assembled.tools : assembled.tools.filter((tool) => !disabled.has(tool.name));
    const scope = context?.scope;
    const approvalPolicy = readApprovalPolicy(scope);
    if (approvalPolicy?.policy === "never") {
      const advertise = new Set(advertisedToolNames(kept.map((tool) => tool.name), approvalPolicy.policy, {
        agent: askingAgentOf({ agent: scope }),
        config: readPermissionConfig(),
        sandboxMode: readSandboxMode(scope),
        mcpServerNames: readMcpServerNames() ?? []
      }));
      kept = kept.filter((tool) => advertise.has(tool.name));
    }
    if (kept === assembled.tools) return assembled;
    return { ...assembled, tools: kept };
  }));
  ctx.effect(() => disposeAssemble, "enpoi-capabilities: tool schema strip");
  import("@deepseek-ai/dsh-mcp-client").then(async (mcpClient) => {
    const mounted = /* @__PURE__ */ new Map();
    const mountedPending = /* @__PURE__ */ new Set();
    const mountErrors = /* @__PURE__ */ new Map();
    const publishedMountErrors = /* @__PURE__ */ new Map();
    function getServerCatalog() {
      try {
        return documentValue(config.mcpServers, "mcpServers") ?? {};
      } catch {
        return {};
      }
    }
    async function resolveCredential(name2) {
      if (!name2) return void 0;
      const seam = ctx.get("credentials");
      if (seam?.resolve === void 0) return void 0;
      try {
        const hit = await seam.resolve(name2);
        return hit?.value;
      } catch {
        return void 0;
      }
    }
    let lastSyncSignature;
    async function syncMcpMounts() {
      const state = initialCapabilitiesState(getGlobalDefaults());
      const catalog = getServerCatalog();
      const want = new Set(
        Object.entries(catalog).filter(([id]) => state.mcp[id] === true).map(([id]) => id)
      );
      for (const id of [...mountErrors.keys()]) {
        if (want.has(id)) continue;
        mountErrors.delete(id);
        publishedMountErrors.delete(id);
      }
      if (want.size > 0 || mounted.size > 0) {
        const signature = `want=[${[...want].join(",")}] mounted=[${[...mounted.keys()].join(",")}]`;
        if (signature !== lastSyncSignature) {
          lastSyncSignature = signature;
          process.stderr.write(`[enpoi-capabilities] mcp sync: ${signature}
`);
        }
      }
      for (const [id, fiber] of [...mounted]) {
        if (!want.has(id)) {
          mounted.delete(id);
          void fiber.dispose().catch(() => {
          });
        }
      }
      for (const id of want) {
        if (mounted.has(id) || mountedPending.has(id)) continue;
        const def = catalog[id];
        const serverName = def.serverName ?? id.replace(/-mcp$/, "");
        if (!def.url) continue;
        mountedPending.add(id);
        try {
          const apiKey = await resolveCredential(def.apiKeyEnv);
          const headers = { ...def.headers ?? {} };
          if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
          const fiber = ctx.plugin(mcpClient.apply, {
            transport: "streamable-http",
            serverName,
            url: def.url,
            headers,
            toolCallTimeoutMs: def.toolCallTimeoutMs ?? 6e4,
            failOnStartupError: false
          });
          await fiber;
          mounted.set(id, fiber);
          mountErrors.delete(id);
          publishedMountErrors.delete(id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          mountErrors.set(id, message);
          process.stderr.write(`[enpoi-capabilities] mcp mount failed for ${id}: ${message}
`);
          if (publishedMountErrors.get(id) !== message) {
            publishedMountErrors.set(id, message);
            void probeAll().catch(() => {
            });
          }
        } finally {
          mountedPending.delete(id);
        }
      }
    }
    void syncMcpMounts();
    ctx.setTimeout(() => void syncMcpMounts(), 3e3);
    let lastSyncedToggleMap;
    const onTogglesUpdated = ((ns) => {
      if (String(ns) !== "enpoi-orchestration") return;
      const toggleMap = JSON.stringify(initialCapabilitiesState(getGlobalDefaults()).mcp);
      if (toggleMap === lastSyncedToggleMap) return;
      lastSyncedToggleMap = toggleMap;
      void syncMcpMounts();
    });
    ctx.on("settings/updated", onTogglesUpdated);
    ctx.on("settings/document-updated", onTogglesUpdated);
    let lastWrittenJson = "";
    async function probeServer(id, def) {
      if (!def.url) return { state: "down" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const headers = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...def.headers ?? {}
        };
        const apiKey = await resolveCredential(def.apiKeyEnv);
        if (apiKey && !headers.Authorization) headers.Authorization = `Bearer ${apiKey}`;
        const res = await fetch(def.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "enpoi-capabilities-probe", version: "1.0.0" } } }),
          signal: controller.signal
        });
        return { state: "online", authError: res.status === 401 || res.status === 403 };
      } catch {
        return { state: "down" };
      } finally {
        clearTimeout(timer);
      }
    }
    let lastWritten = {};
    function sameStatus(previous, next) {
      return previous !== void 0 && previous.state === next.state && previous.mounted === next.mounted && previous.authError === next.authError && previous.error === next.error;
    }
    async function probeAll() {
      const catalog = getServerCatalog();
      const next = {};
      for (const [id, def] of Object.entries(catalog)) {
        const isMounted = mounted.has(id) || mountedPending.has(id);
        if (isMounted) {
          const entry2 = { state: "online", mounted: true, checkedAt: Date.now() };
          const previous2 = lastWritten[id];
          next[id] = sameStatus(previous2, entry2) ? { ...entry2, checkedAt: previous2.checkedAt } : entry2;
          continue;
        }
        const probe = await probeServer(id, def);
        const entry = {
          state: probe.state,
          mounted: false,
          checkedAt: Date.now(),
          ...probe.authError ? { authError: true } : {},
          ...mountErrors.has(id) ? { error: mountErrors.get(id) } : {}
        };
        const previous = lastWritten[id];
        next[id] = sameStatus(previous, entry) ? { ...entry, checkedAt: previous.checkedAt } : entry;
      }
      const json = JSON.stringify(next);
      if (json === lastWrittenJson) return;
      lastWrittenJson = json;
      lastWritten = next;
      try {
        const settingsApi = ctx.get("settings");
        void settingsApi.mutate?.(ORCH_NS, [{ op: "set", path: ["mcpStatus"], value: next }]);
      } catch {
      }
    }
    ctx.setInterval(() => void probeAll().catch(() => {
    }), 15e3);
    ctx.setTimeout(() => void probeAll().catch(() => {
    }), 4e3);
  }).catch(() => {
  });
  ctx.on("agent/pre-step", (async (params, next) => {
    const decision = await next();
    if (decision.kind !== "enter") return decision;
    const messages = decision.messages;
    if (!Array.isArray(messages)) return decision;
    const state = initialCapabilitiesState(getGlobalDefaults());
    const disabledSkillIds = new Set(
      Object.entries(state.skills).filter(([, enabled]) => enabled === false).map(([id]) => id)
    );
    if (disabledSkillIds.size === 0) return decision;
    const sessionId = params?.agent?.session?.id ?? "";
    const { messages: filtered } = filterSkillCatalogMessages(messages, disabledSkillIds, publishedCatalog, sessionId);
    return { ...decision, messages: filtered };
  }));
  const pendingGrants = /* @__PURE__ */ new Map();
  function readPermissionConfig() {
    try {
      return documentValue(config.permissions, "permissions") ?? {};
    } catch {
      return {};
    }
  }
  function readMcpCatalogDefs() {
    try {
      const catalog = documentValue(config.mcpServers, "mcpServers");
      if (catalog === void 0 || catalog === null || typeof catalog !== "object" || Array.isArray(catalog)) return void 0;
      return catalog;
    } catch {
      return void 0;
    }
  }
  function readMcpServerNames() {
    const catalog = readMcpCatalogDefs();
    return catalog === void 0 ? void 0 : Object.entries(catalog).map(([id, def]) => mcpServerNameOf(id, def));
  }
  function currentPresetOf(session) {
    try {
      const projections = ctx.get("sessionProjections");
      const value = projections?.stateOf?.(session, "agentPreset");
      return typeof value === "string" && value !== "" ? value : void 0;
    } catch {
      return void 0;
    }
  }
  function askingAgentOf(exec) {
    return agentRoleOf(exec.agent, currentPresetOf);
  }
  function readSandboxMode(agent) {
    try {
      const session = agent?.session;
      if (session === void 0 || typeof session.eventAt !== "function") return void 0;
      for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
        const event = session.eventAt(seq);
        if (event?.type === "sandbox/mode") return String(event.data.mode ?? "");
      }
      const shell = ctx.get("shell");
      return shell?.sandboxMode;
    } catch {
      return void 0;
    }
  }
  function readApprovalPolicy(agent) {
    try {
      const session = agent?.session;
      if (session === void 0 || typeof session.eventAt !== "function") return void 0;
      const seq = typeof session.seq === "number" ? session.seq : 0;
      for (let index = seq - 1; index >= 0; index -= 1) {
        const event = session.eventAt(index);
        if (event?.type === "approval/policy") {
          return { policy: String(event.data?.policy ?? ""), delegated: event.data?.source === "delegation" };
        }
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
  function liveRootOf(childSessionId) {
    const agents = ctx.get("agents");
    if (agents?.get === void 0) return void 0;
    let current = agents.get(childSessionId);
    for (let hop = 0; hop < 33; hop += 1) {
      if (current === void 0) return void 0;
      const header = current.session?.header;
      const parentSession = header?.parentSession;
      if (parentSession === void 0 || parentSession === "") {
        const id = typeof header?.id === "string" && header.id !== "" ? header.id : current.id ?? "";
        return id === "" ? void 0 : { id, agent: current };
      }
      current = agents.get(String(parentSession));
    }
    return void 0;
  }
  function rootModeOf(root) {
    const agent = root.agent;
    if (agent?.session === void 0) return void 0;
    const sandbox = readSandboxMode(agent) ?? "workspace-write";
    const approval = readApprovalPolicy(agent)?.policy ?? ctx.get("approval")?.config?.policy ?? "ask";
    if (approval !== "never") return "interactive";
    return sandbox === "danger-full-access" ? "full-access" : "unattended";
  }
  function parentAllowsRail(query) {
    const agent = query.root.agent;
    if (query.rail === "boundary") return readSandboxMode(agent) === "danger-full-access";
    const decision = resolvePolicy({
      toolName: query.toolName,
      ...query.command !== void 0 ? { command: query.command } : {},
      agent: askingAgentOf({ agent }),
      reviewer: false,
      config: readPermissionConfig(),
      sandboxMode: readSandboxMode(agent),
      mcpServerNames: readMcpServerNames() ?? []
    });
    return decision.kind === "allow";
  }
  function requestRootApproval(query) {
    const approval = ctx.get("approval");
    if (approval?.request === void 0) {
      return Promise.reject(new Error("the approval service is not composed"));
    }
    return approval.request({
      agent: query.root.agent,
      toolName: query.toolName,
      reason: query.reason,
      displayReason: query.displayReason,
      ...query.broadAllow !== void 0 ? { broadAllow: query.broadAllow } : {},
      ...query.signal !== void 0 ? { signal: query.signal } : {}
    });
  }
  const approvalForwarding = new ChildApprovalForwarder({
    findRoot: liveRootOf,
    modeOf: rootModeOf,
    parentAllowsRail,
    askRoot: requestRootApproval,
    report: (line) => process.stderr.write(`[enpoi-capabilities] ${line}
`),
    depthCap: () => {
      const subagents = ctx.get("subagents");
      const depth = subagents?.resolveMaxDepth?.();
      return typeof depth === "number" && Number.isSafeInteger(depth) && depth >= 0 ? depth : 1;
    }
  });
  const disposePolicy = ctx.on("tools/pre-execute", (async (exec, next) => {
    const state = initialCapabilitiesState(getGlobalDefaults());
    const capabilityDecision = evaluateToolCall(exec.name, exec.arguments, state, readMcpCatalogDefs());
    if (!capabilityDecision.allowed) {
      return { kind: "deny", reason: capabilityDecision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.` };
    }
    const config2 = readPermissionConfig();
    const isBash = exec.name === "bash";
    const decision = resolvePolicy({
      toolName: exec.name,
      command: isBash && typeof exec.arguments?.command === "string" ? exec.arguments.command : void 0,
      agent: askingAgentOf(exec),
      // A delegated child carries the PARENT's preset, so reviewer seats are
      // identified from the child's own subagent descriptor, not the role id.
      // Computed only for the gated tool: the descriptor scan is unnecessary
      // work for every other call.
      reviewer: exec.name === REVIEW_RUN_TOOL ? reviewerSeatOf(exec.agent, currentPresetOf) : false,
      config: config2,
      sandboxMode: readSandboxMode(exec.agent),
      mcpServerNames: readMcpServerNames() ?? []
    });
    if (decision.kind === "allow") return await next();
    if (decision.kind === "deny") return { kind: "deny", reason: decision.reason };
    const approvalPolicy = readApprovalPolicy(exec.agent);
    if (approvalPolicy?.policy === "never") {
      if (delegatedChildOf(exec.agent) !== void 0) {
        const resolution = await approvalForwarding.forward({
          agent: exec.agent,
          toolName: exec.name,
          args: exec.arguments,
          decision,
          ...exec.signal !== void 0 ? { signal: exec.signal } : {}
        });
        if (resolution.kind === "deny") return { kind: "deny", reason: resolution.reason };
        const downstream = await next();
        if (downstream.kind === "ask") {
          return { kind: "deny", reason: `a downstream policy layer requires approval for ${exec.name}, which a delegated child's forwarded ask cannot satisfy` };
        }
        return downstream;
      }
      return {
        kind: "deny",
        reason: `${exec.name} was denied automatically: this ${approvalPolicy.delegated ? "delegated subagent" : "session"} runs with approval prompts disabled, so the approval policy denied it without asking a user. It required approval because: ${decision.reason}.`
      };
    }
    if (typeof exec.callId === "string" && pendingGrants.size < 128) {
      pendingGrants.set(String(exec.callId), grantProposalFor(decision, exec.name, isBash ? String(exec.arguments?.command) : void 0, askingAgentOf(exec)));
    }
    return {
      kind: "ask",
      reason: decision.reason,
      // The danger-list broad action travels with the ask so the card can label
      // it ("allow all rm"); the decision itself stays a closed outcome.
      ...decision.broadAllow !== void 0 ? { broadAllow: decision.broadAllow } : {}
    };
  }));
  ctx.effect(() => disposePolicy, "enpoi-capabilities: permission policy pre-execute");
  installSearchNudge(ctx);
  installReviewRunTool(ctx);
  async function persistGrant(proposal) {
    const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const grant = standingGrantRecord(id, proposal, (/* @__PURE__ */ new Date()).toISOString());
    const settings = ctx.get("settings");
    if (settings?.mutate === void 0) {
      process.stderr.write("[enpoi-capabilities] grant persistence failed: settings service unavailable\n");
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = settings.describe?.().find((entry) => entry.ns === ORCH_NS)?.revision;
      const existing = readPermissionConfig().grants ?? {};
      const next = { ...existing, [id]: grant };
      try {
        await settings.mutate(ORCH_NS, [{ op: "set", path: ["permissions", "grants"], value: next }], revision);
        process.stderr.write(`[enpoi-capabilities] standing grant persisted: ${grant.tool}${grant.pattern ? ` ${grant.pattern}` : ""}${grant.agent ? ` (agent ${grant.agent})` : ""}
`);
        return;
      } catch (error) {
        const conflict = error;
        if (conflict?.code === "SETTINGS_CONFLICT" && attempt < 2) continue;
        process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}
`);
        return;
      }
    }
  }
  let lastMcpServerNames = readMcpServerNames();
  const onCatalogUpdated = ((ns) => {
    if (String(ns) !== ORCH_NS) return;
    const names = readMcpServerNames();
    if (names === void 0) return;
    const previous = lastMcpServerNames;
    lastMcpServerNames = names;
    if (previous === void 0) return;
    const current = new Set(names);
    const removed = [...new Set(previous.filter((name2) => !current.has(name2)))];
    if (removed.length === 0) return;
    const settings = ctx.get("settings");
    void pruneRemovedMcpPolicyRows(settings, removed, readPermissionConfig).then((count) => {
      if (count > 0) process.stderr.write(`[enpoi-capabilities] removed MCP policy rows: ${count} row(s) for ${removed.join(", ")}
`);
    }).catch((error) => {
      process.stderr.write(`[enpoi-capabilities] removed MCP policy cleanup failed: ${String(error)}
`);
    });
  });
  ctx.effect(() => {
    const disposeUpdated = ctx.on("settings/updated", onCatalogUpdated);
    const disposeDocumentUpdated = ctx.on("settings/document-updated", onCatalogUpdated);
    return () => {
      disposeUpdated();
      disposeDocumentUpdated();
    };
  }, "enpoi-capabilities: removed-MCP policy cleanup");
  const disposeGrantWatch = ctx.on("session/event", ((session, event) => {
    if (event?.type !== "approval/decided") return void 0;
    const outcome = event.data?.outcome;
    if (outcome !== "allowed-always" && outcome !== "allowed-always-broad") return void 0;
    const approvalId = event.data.id;
    if (approvalId === void 0) return void 0;
    let callId;
    let forwarded = false;
    if (typeof session?.eventAt === "function") {
      for (let seq = event.seq ?? session.seq ?? 0; seq >= 0 && seq >= (event.seq ?? 0) - 64; seq -= 1) {
        const e = session.eventAt(seq);
        if (e?.type === "approval/asked" && e.data.id === approvalId) {
          const reason = e.data.reason;
          if (typeof reason === "string" && reason.includes(FORWARDED_ASK_MARKER)) forwarded = true;
          const c = e.data.callId;
          if (c !== void 0) callId = String(c);
          break;
        }
      }
    }
    if (forwarded) return void 0;
    if (callId === void 0) {
      callId = [...pendingGrants.keys()][0];
    }
    if (callId === void 0) return void 0;
    const proposal = pendingGrants.get(callId);
    pendingGrants.delete(callId);
    if (proposal !== void 0) void persistGrant(
      grantProposalForOutcome(proposal, outcome === "allowed-always-broad")
    ).catch((error) => {
      process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}
`);
    });
    return void 0;
  }));
  ctx.effect(() => disposeGrantWatch, "enpoi-capabilities: allow-always grant writer");
}
export {
  CapabilitiesSchema,
  Config,
  KNOWN_CAPABILITIES,
  OrchestrationSettingsSchema,
  PROTECTED_CAPABILITIES,
  apply,
  evaluateToolCall,
  initialCapabilitiesState,
  inject,
  name,
  pruneRemovedMcpPolicyRows
};
