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
function decideSubCommand(sub, config, agent) {
  const agentCfg = agent !== void 0 ? config.agents?.[agent] : void 0;
  const agentPatterns = agentCfg?.bashPatterns;
  if (agentPatterns !== void 0) {
    for (const { pattern, policy } of agentPatterns) {
      if (!matchBashPattern(pattern, sub)) continue;
      if (policy === "deny") return { kind: "deny", reason: `bash rule "${pattern}" denies this command`, source: `agent pattern:${pattern}` };
      if (policy === "ask") return { kind: "ask", reason: `bash rule "${pattern}" requires approval`, source: `agent pattern:${pattern}`, grantTier: "pattern", pattern };
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
    if (policy === "ask") return { kind: "ask", reason: `bash rule "${pattern}" requires approval`, source: `pattern:${pattern}`, grantTier: "pattern", pattern };
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
      if (sawAsk.grantTier === "pattern" && sawAsk.pattern !== void 0 && grantsShortCircuit(toolName, who, input.config.grants, "pattern", sawAsk.pattern)) {
        return { kind: "allow", source: `grant:pattern:${sawAsk.pattern}` };
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
function isMcpToolName(toolName) {
  return toolName.startsWith("mcp__");
}
function grantProposalFor(decision, toolName, command, agent) {
  if (decision.grantTier === "pattern" && decision.pattern !== void 0) {
    return { tool: toolName, pattern: decision.pattern, agent };
  }
  return { tool: toolName, agent };
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
var MUTATION_TOOLS, SHIPPED_TOOL_DEFAULTS, SHIPPED_BASH_PATTERNS, HIDDEN_SURFACE, DANGER_VERBS, OPAQUE_EXECUTORS, INLINE_INTERPRETERS;
var init_policy = __esm({
  "src/policy.ts"() {
    "use strict";
    MUTATION_TOOLS = /* @__PURE__ */ new Set(["bash", "edit", "write", "str_replace_editor"]);
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
      whiteboard_read: "allow",
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
async function removeMcpServerFenced(settings, id, ns = ORCHESTRATION_NS) {
  if (!canFenceMcpWrites(settings)) return { removed: false, rows: 0 };
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const value = settings.get?.(ns);
    const def = (value?.mcpServers ?? {})[id];
    if (def === void 0) return { removed: false, rows: 0 };
    const server = mcpServerNameOf(id, def);
    const ops = [
      { op: "unset", path: ["mcpServers", id] },
      ...mcpPolicyRemovalOps(server, value?.permissions)
    ];
    const revision = settings.describe?.().find((entry) => entry.ns === ns)?.revision;
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
var _removeMcpServer_dec, _mcpTools_dec, _a, _init, EnpoiCapabilitiesService;
var init_rpc = __esm({
  "src/rpc.ts"() {
    "use strict";
    init_mcp_tools();
    EnpoiCapabilitiesService = class extends (_a = TypertRemoteService, _mcpTools_dec = [Remote], _removeMcpServer_dec = [Remote], _a) {
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
      async removeMcpServer(id) {
        const settings = this.ctx.get("settings");
        return await removeMcpServerFenced(settings, id);
      }
    };
    _init = __decoratorStart(_a);
    __decorateElement(_init, 1, "mcpTools", _mcpTools_dec, EnpoiCapabilitiesService);
    __decorateElement(_init, 1, "removeMcpServer", _removeMcpServer_dec, EnpoiCapabilitiesService);
    __decoratorMetadata(_init, EnpoiCapabilitiesService);
  }
});

// src/index.ts
import Schema from "schemastery";

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
var publishedCatalog = /* @__PURE__ */ new Map();
var name = "enpoi-capabilities";
var inject = ["tools", "systemPrompt", "settings", "timer"];
var ORCH_NS = "enpoi-orchestration";
var CapabilitiesSchema = Schema.object({
  tools: Schema.dict(Schema.boolean()).default({}),
  skills: Schema.dict(Schema.boolean()).default({}),
  mcp: Schema.dict(Schema.boolean()).default({})
});
var OrchestrationSettingsSchema = Schema.object({
  capabilities: CapabilitiesSchema,
  mcpServers: Schema.dict(Schema.any()).default({}),
  mcpStatus: Schema.dict(Schema.any()).default({}),
  personas: Schema.dict(Schema.any()).default({}),
  // Operator-defined specialist roles and councils (doc 59): declared here so
  // the namespace contract is explicit rather than relying on unknown-key
  // survival — both remain opaque plugin-owned vocabularies.
  roles: Schema.dict(Schema.any()).default({}),
  councils: Schema.dict(Schema.any()).default({}),
  // Operator-defined model failover chains (doc 60): id → { label?, links,
  // attempts?, onCut?, disabled? }. Owned by enpoi-model-chains, declared here
  // so the namespace contract admits the key rather than relying on
  // unknown-key survival.
  chains: Schema.dict(Schema.any()).default({}),
  parameters: Schema.any(),
  // UI preferences (favorites, hidden models, model assignments, …) shared by
  // every client through `settings/document-updated`. `hiddenSurfaces` is
  // declared here so the namespace contract admits the duplicate-surface
  // preference — rail page kinds and conversation view ids the client must not
  // render (`{ sidebarRight: string[], views: string[] }`) — rather than
  // relying on unknown-key survival; sibling keys stay opaque.
  uiPreferences: Schema.object({
    hiddenSurfaces: Schema.any()
  }),
  permissions: Schema.any(),
  // Pinned whiteboard (doc 66 §3c / doc 67 §B): orchestrator-authored
  // core-context board, owned by enpoi-whiteboard and rendered into every
  // runtime-context snapshot. Declared so the namespace contract admits the
  // key rather than relying on unknown-key survival.
  whiteboard: Schema.any()
});
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
function apply(ctx) {
  try {
    const settingsApi = ctx.get("settings");
    settingsApi?.register?.(ORCH_NS, OrchestrationSettingsSchema, { base: { capabilities: {} } });
  } catch (error) {
    process.stderr.write(`[enpoi-capabilities] namespace registration failed: ${String(error)}
`);
  }
  function getGlobalDefaults() {
    try {
      const settings = ctx.get("settings");
      return settings?.get?.(ORCH_NS)?.capabilities;
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
  const disposeAssemble = ctx.on("system-prompt/assemble", (async (_assembly, _context, next) => {
    const assembled = await next();
    if (!Array.isArray(assembled.tools) || assembled.tools.length === 0) return assembled;
    const state = initialCapabilitiesState(getGlobalDefaults());
    const disabled = new Set(
      Object.entries(state.tools).filter(([id, enabled]) => !enabled && !PROTECTED_CAPABILITIES.has(id)).map(([id]) => id)
    );
    if (disabled.size === 0) return assembled;
    const kept = assembled.tools.filter((tool) => !disabled.has(tool.name));
    if (kept.length === assembled.tools.length) return assembled;
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
        const settings = ctx.get("settings");
        return settings?.get?.(ORCH_NS)?.mcpServers ?? {};
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
    ctx.on("settings/updated", ((ns) => {
      if (String(ns) !== "enpoi-orchestration") return;
      const toggleMap = JSON.stringify(initialCapabilitiesState(getGlobalDefaults()).mcp);
      if (toggleMap === lastSyncedToggleMap) return;
      lastSyncedToggleMap = toggleMap;
      void syncMcpMounts();
    }));
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
    async function probeAll() {
      const catalog = getServerCatalog();
      const next = {};
      for (const [id, def] of Object.entries(catalog)) {
        const isMounted = mounted.has(id) || mountedPending.has(id);
        if (isMounted) {
          next[id] = { state: "online", mounted: true, checkedAt: Date.now() };
          continue;
        }
        const probe = await probeServer(id, def);
        next[id] = {
          state: probe.state,
          mounted: false,
          checkedAt: Date.now(),
          ...probe.authError ? { authError: true } : {},
          ...mountErrors.has(id) ? { error: mountErrors.get(id) } : {}
        };
      }
      const json = JSON.stringify(next);
      if (json === lastWrittenJson) return;
      lastWrittenJson = json;
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
      const settings = ctx.get("settings");
      return settings?.get?.(ORCH_NS)?.permissions ?? {};
    } catch {
      return {};
    }
  }
  function readMcpCatalogDefs() {
    try {
      const settings = ctx.get("settings");
      const value = settings?.get?.(ORCH_NS);
      if (value === void 0) return void 0;
      const catalog = value.mcpServers;
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
  const disposePolicy = ctx.on("tools/pre-execute", (async (exec, next) => {
    const state = initialCapabilitiesState(getGlobalDefaults());
    const capabilityDecision = evaluateToolCall(exec.name, exec.arguments, state, readMcpCatalogDefs());
    if (!capabilityDecision.allowed) {
      return { kind: "deny", reason: capabilityDecision.syntheticResult ?? `[CAPABILITY_DISABLED] Tool '${exec.name}' is disabled by operator preference.` };
    }
    const config = readPermissionConfig();
    const isBash = exec.name === "bash";
    const decision = resolvePolicy({
      toolName: exec.name,
      command: isBash && typeof exec.arguments?.command === "string" ? exec.arguments.command : void 0,
      agent: askingAgentOf(exec),
      config,
      sandboxMode: readSandboxMode(exec.agent),
      mcpServerNames: readMcpServerNames() ?? []
    });
    if (decision.kind === "allow") return await next();
    if (decision.kind === "deny") return { kind: "deny", reason: decision.reason };
    if (typeof exec.callId === "string" && pendingGrants.size < 128) {
      pendingGrants.set(String(exec.callId), grantProposalFor(decision, exec.name, isBash ? String(exec.arguments?.command) : void 0, askingAgentOf(exec)));
    }
    return { kind: "ask", reason: decision.reason };
  }));
  ctx.effect(() => disposePolicy, "enpoi-capabilities: permission policy pre-execute");
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
  const disposeMcpPolicyCleanup = ctx.on("settings/updated", ((ns) => {
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
  }));
  ctx.effect(() => disposeMcpPolicyCleanup, "enpoi-capabilities: removed-MCP policy cleanup");
  const disposeGrantWatch = ctx.on("session/event", ((session, event) => {
    if (event?.type !== "approval/decided") return void 0;
    const outcome = event.data?.outcome;
    if (outcome !== "allowed-always") return void 0;
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
    if (proposal !== void 0) void persistGrant(proposal).catch((error) => {
      process.stderr.write(`[enpoi-capabilities] grant persistence failed: ${String(error)}
`);
    });
    return void 0;
  }));
  ctx.effect(() => disposeGrantWatch, "enpoi-capabilities: allow-always grant writer");
}
export {
  CapabilitiesSchema,
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
