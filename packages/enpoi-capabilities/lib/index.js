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
        reason: `command runs ${opaque.split(/\s+/)[0]}, which can execute arbitrary code \u2014 approve explicitly`,
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
        reason: "command embeds a shell expansion or wrapper containing a destructive verb \u2014 approve explicitly",
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

// ../enpoi-contracts/lib/index.js
var __defProp2 = Object.defineProperty;
var __export2 = (target, all) => {
  for (var name2 in all)
    __defProp2(target, name2, { get: all[name2], enumerable: true });
};
var external_exports = {};
__export2(external_exports, {
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
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
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
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
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
var traceContextSchema = external_exports.object({
  /** Root query id — one user query spans one trace. */
  traceId: external_exports.string().min(1),
  /** Run id — one subagent run / keeper pass. */
  runId: external_exports.string().min(1),
  /** Persona name (orchestrator, oracle, fixer, context-keeper, …). */
  persona: external_exports.string(),
  /** Parent event seq this event derives from. */
  parentSeq: external_exports.number().int().nonnegative(),
  /** This event's own seq. */
  seq: external_exports.number().int().nonnegative()
}).strict();
var provenanceSchema = external_exports.object({
  parentSeqs: external_exports.array(external_exports.number().int().nonnegative()),
  childSessionId: external_exports.string().min(1),
  toolSeqs: external_exports.array(external_exports.number().int().nonnegative())
}).strict();
var subagentReturnSchema = external_exports.object({
  /** Files the run changed. */
  changed: external_exports.array(external_exports.string()),
  /** Whether the run verified its own work. */
  verified: external_exports.boolean(),
  /** Files changed but NOT verified (verification gate rejects these). */
  NOT_verified: external_exports.array(external_exports.string()),
  /** Facts the run wants remembered (memory pipeline intake). */
  remember_later: external_exports.array(external_exports.string()),
  /** Provenance for the memory pipeline (living-owner rule). */
  provenance: provenanceSchema
}).strict();
var briefProseUpdatedSchema = external_exports.object({
  goal: external_exports.string().optional(),
  decisions: external_exports.array(external_exports.string()).optional(),
  openThreads: external_exports.array(external_exports.string()).optional(),
  /** The session seq the keeper's input was based on (I3 comparison). */
  basedOnSeq: external_exports.number().int().nonnegative(),
  /** Structural-event count (user/message, turn/end, tool/call, tool/result) at basedOnSeq — seq-based freshness (Oracle amendment 4). */
  basedOnStructuralCount: external_exports.number().int().nonnegative(),
  /** The structural-distance threshold the keeper used — view() classifies freshness with it. */
  structuralDistanceK: external_exports.number().int().positive().optional(),
  /** Route used, e.g. "deepseek/deepseek-v4-flash". */
  model: external_exports.string(),
  /** The prose summary text. */
  text: external_exports.string(),
  /** Always the keeper — the fold rejects other origins. */
  origin: external_exports.literal("context-keeper")
}).strict();
var briefEntrySchema = external_exports.object({
  id: external_exports.string(),
  text: external_exports.string(),
  seq: external_exports.number().int().nonnegative()
}).strict();
var blockerSchema = external_exports.object({
  id: external_exports.string(),
  text: external_exports.string(),
  tool: external_exports.string().optional(),
  seq: external_exports.number().int().nonnegative()
}).strict();
var livingBriefStateSchema = external_exports.object({
  goal: external_exports.string(),
  decisions: external_exports.array(briefEntrySchema),
  constraints: external_exports.array(briefEntrySchema),
  openThreads: external_exports.array(briefEntrySchema),
  filesTouched: external_exports.array(external_exports.string()),
  blockers: external_exports.array(blockerSchema),
  phase: external_exports.string(),
  prose: external_exports.object({
    text: external_exports.string(),
    updatedAt: external_exports.number(),
    model: external_exports.string(),
    basedOnSeq: external_exports.number().int().nonnegative(),
    basedOnStructuralCount: external_exports.number().int().nonnegative(),
    structuralDistanceK: external_exports.number().int().positive()
  }).nullable(),
  goalSeq: external_exports.number().int().nonnegative(),
  lastEventSeq: external_exports.number().int().nonnegative(),
  foldErrors: external_exports.number().int().nonnegative(),
  toolNames: external_exports.record(external_exports.string()),
  structuralCount: external_exports.number().int().nonnegative()
}).strict();
var livingBriefViewSchema = external_exports.object({
  goal: external_exports.string(),
  decisions: external_exports.array(briefEntrySchema),
  constraints: external_exports.array(briefEntrySchema),
  openThreads: external_exports.array(briefEntrySchema),
  filesTouched: external_exports.array(external_exports.string()),
  blockers: external_exports.array(blockerSchema),
  phase: external_exports.string(),
  prose: external_exports.object({
    text: external_exports.string(),
    updatedAt: external_exports.number(),
    model: external_exports.string(),
    basedOnSeq: external_exports.number().int().nonnegative(),
    basedOnStructuralCount: external_exports.number().int().nonnegative(),
    structuralDistanceK: external_exports.number().int().positive()
  }).nullable(),
  asOfSeq: external_exports.number().int().nonnegative(),
  freshness: external_exports.union([external_exports.literal("live"), external_exports.literal("cooling"), external_exports.literal("stale")])
}).strict();
var ORCHESTRATION_NAMESPACE = "enpoi-orchestration";
function readSettingsDocument(settings, ns) {
  try {
    const direct = settings?.get?.(ns);
    if (direct !== void 0) {
      return direct !== null && typeof direct === "object" ? direct : void 0;
    }
    const narrow = settings?.describeNamespace?.(ns);
    if (narrow !== void 0) {
      const value2 = narrow.value;
      return value2 !== null && typeof value2 === "object" ? value2 : void 0;
    }
    const value = settings?.describe?.().find((entry) => entry.ns === ns)?.value;
    return value !== null && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function readOrchestrationDocument(settings) {
  return readSettingsDocument(settings, ORCHESTRATION_NAMESPACE);
}

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
import { accessSync, constants, readFileSync, statSync } from "node:fs";
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
function renderReviewRun(_args, value) {
  const run = value;
  const lines = [`review_run ${run.runner}: ${run.command}`];
  if (run.error !== void 0) lines.push(run.error);
  if (run.stdout !== "") lines.push(run.stdout.trimEnd());
  if (run.stderr !== "") lines.push(`[stderr]
${run.stderr.trimEnd()}`);
  if (run.sandbox?.denied === true) {
    lines.push(`[sandbox: file access denied under ${run.sandbox.mode} mode \u2014 the run is read-only]`);
  }
  if (run.timedOut) lines.push(`[timed out after the review-run budget]`);
  if (run.exitCode !== null && run.exitCode !== 0) lines.push(`[exit code: ${String(run.exitCode)}]`);
  else if (run.signal !== null) lines.push(`[killed by signal: ${run.signal}]`);
  return [{ type: "text", text: lines.join("\n") }];
}
var REVIEW_RUN_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    runner: { type: "string" },
    command: { type: "string" },
    exitCode: { type: ["number", "null"] },
    signal: { type: ["string", "null"] },
    timedOut: { type: "boolean" },
    sandbox: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        mode: { type: "string" },
        denied: { type: "boolean" }
      },
      required: ["mode", "denied"]
    },
    stdout: { type: "string" },
    stderr: { type: "string" },
    error: { type: "string" }
  },
  required: ["runner", "command", "exitCode", "signal", "timedOut", "sandbox", "stdout", "stderr"]
};
function installReviewRunTool(ctx) {
  ctx.inject(["shell"], () => {
    const shell = ctx.get("shell");
    const policyService = ctx.get("sandboxPolicy");
    if (shell === void 0 || shell.sandboxMode === void 0 || policyService === void 0) {
      process.stderr.write("[enpoi-capabilities] review_run not registered: no confining executor/sandbox policy\n");
      return;
    }
    ctx.tools.register({
      name: REVIEW_RUN_TOOL,
      description: [
        "Run the workspace test suite READ-ONLY: a fixed runner (pytest/vitest/jest/node-test/go-test/cargo-test),",
        "an optional workspace-relative target, a timeout, and no free shell. The command executes in the",
        "workspace root under the read-only sandbox, so tests cannot write files; runner stderr may still show",
        "cache writes denied, and network access is not blocked. A workspace `.dsh/review-run.json` may pin the",
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
          const override = readReviewRunnerOverride(standing.workspaceRoot, runner);
          value.command = buildReviewRunCommand(
            runner,
            typeof request.target === "string" ? request.target : void 0,
            standing.workspaceRoot,
            override
          );
          const sandboxPolicy = { ...standing, mode: "read-only" };
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
          value.sandbox = { mode: result.sandbox?.mode ?? "read-only", denied: result.sandbox?.denied ?? false };
          return value;
        } catch (error) {
          value.error = `review_run could not execute: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
          return value;
        }
      }
    });
  });
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
    if (typeof session?.eventAt === "function") {
      for (let seq = event.seq ?? session.seq ?? 0; seq >= 0 && seq >= (event.seq ?? 0) - 64; seq -= 1) {
        const e = session.eventAt(seq);
        if (e?.type === "approval/asked" && e.data.id === approvalId) {
          const c = e.data.callId;
          if (c !== void 0) callId = String(c);
          break;
        }
      }
    }
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
