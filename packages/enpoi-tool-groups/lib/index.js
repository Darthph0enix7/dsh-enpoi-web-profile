// src/index.ts
import Schema from "@deepseek-ai/schemastery";
import { createScope, scopeOf } from "@deepseek-ai/dsh-scope";
import { readOrchestrationDocument } from "dsh-enpoi-contracts";

// src/catalog.ts
var SHIPPED_TOOL_GROUPS = Object.freeze([
  {
    id: "core",
    label: "Core",
    purpose: "the everyday implementation surface",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: [
      "ask_user_question",
      "bash",
      "edit",
      "glob",
      "grep",
      "read",
      "read_image",
      "skill",
      "subagent",
      "todo_write",
      "web_search",
      "write",
      "present"
    ]
  },
  {
    id: "goals",
    label: "Goals",
    purpose: "create, read, and update the session goal",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["create_goal", "get_goal", "update_goal"]
  },
  {
    id: "plan",
    label: "Plan mode",
    purpose: "submit an implementation plan for approval",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["exit_plan_mode"]
  },
  {
    id: "councils",
    label: "Councils",
    purpose: "oracle review, roundtable debate, and chorus brainstorming",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["chorus", "council_list", "council_register", "oracle_review", "request_evidence", "roundtable"]
  },
  {
    id: "jobs",
    label: "Jobs",
    purpose: "list, read, and stop background shell jobs",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["job_kill", "job_list", "job_output"]
  },
  {
    id: "workflow",
    label: "Workflows",
    purpose: "run deterministic workflow and ralph programs",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["ralph", "workflow"]
  },
  {
    id: "reporting",
    label: "Reporting",
    purpose: "fast structured progress reports",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["fast_report"]
  },
  {
    id: "whiteboard",
    label: "Whiteboard",
    purpose: "pin, read, and forget durable board notes",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["whiteboard_forget", "whiteboard_pin", "whiteboard_read", "whiteboard_unpin", "whiteboard_write"]
  },
  {
    id: "memory",
    label: "Memory",
    purpose: "save, search, confirm, and rescind durable project facts",
    mode: "static",
    preAttach: [],
    enabled: true,
    members: ["memory_confirm", "memory_rescind", "memory_save", "memory_search"]
  },
  {
    id: "peer",
    label: "Peer interconnect",
    purpose: "cross-device peer sessions: status, ask, answer, cancel",
    mode: "on-demand",
    preAttach: [],
    enabled: true,
    members: ["peer_status", "peer_ask", "peer_asks", "peer_answer", "peer_cancel"]
  },
  {
    id: "debug",
    label: "Debug & observability",
    purpose: "session log, event trace, and diagnostics inspection",
    mode: "on-demand",
    // Every main-agent seat pre-attaches the debug group. The Creator and the
    // council broker advertise self-diagnosis in their personas; orchestrator
    // and sysadmin carry the same read-only diagnostics surface. An operator
    // seat override in the document still wins.
    preAttach: ["orchestrator", "sysadmin", "creator", "broker"],
    enabled: true,
    members: [
      "diagnostics_report",
      "session_debug",
      "session_event_read",
      "session_event_search",
      "session_event_trace",
      "session_search",
      "session_trace"
    ]
  },
  {
    id: "creator",
    label: "Creator (harness authoring)",
    purpose: "inspect and manage the harness plugin composition",
    mode: "on-demand",
    // Only the Creator seat pre-attaches, and only the Creator seat can see or
    // attach the group at all (`seats`): harness authoring is its specialty, so
    // orchestrator and sysadmin never SEE the tools — the group's deny filter
    // removes them from the advertised surface and this group is absent from
    // their menu and meta-tool listing (the seat guard in `enpoi-capabilities`
    // stays as the execution backstop). This is a deliberate break of the
    // byte-identical main-agent tool block: a cross-agent switch rebuilds the
    // provider's prompt prefix once; turns within one seat keep the prefix.
    preAttach: ["creator"],
    seats: ["creator"],
    enabled: true,
    members: ["cordis_inspect_list", "cordis_inspect_query", "plugin_manager"]
  }
]);
var GROUP_ORDER = SHIPPED_TOOL_GROUPS.map((group) => group.id);
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asStringList(value) {
  if (!Array.isArray(value)) return void 0;
  const seen = /* @__PURE__ */ new Set();
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) seen.add(entry);
  }
  return [...seen];
}
function resolveToolGroups(document) {
  const doc = asRecord(document);
  const toolGroups = asRecord(doc?.["toolGroups"]);
  const groupOverrides = asRecord(toolGroups?.["groups"]);
  const groups = SHIPPED_TOOL_GROUPS.map((group) => {
    const override = asRecord(groupOverrides?.[group.id]);
    return {
      ...group,
      enabled: typeof override?.["enabled"] === "boolean" ? override["enabled"] : group.enabled
    };
  });
  const byId = new Map(groups.map((group) => [group.id, group]));
  const seats = /* @__PURE__ */ new Map();
  const seatOverrides = asRecord(toolGroups?.["seats"]);
  if (seatOverrides !== void 0) {
    for (const [seat, value] of Object.entries(seatOverrides)) {
      const preAttach = asStringList(asRecord(value)?.["preAttach"]);
      if (preAttach !== void 0) seats.set(seat, preAttach);
    }
  }
  return { groups, byId, seats };
}
function preAttachFor(catalog, seat) {
  const override = catalog.seats.get(seat);
  const candidates = override ?? catalog.groups.filter((group) => group.preAttach.includes(seat)).map((group) => group.id);
  return sortGroupIds(candidates.filter((id) => {
    const group = catalog.byId.get(id);
    return group !== void 0 && group.enabled && groupVisibleTo(group, seat);
  }));
}
function groupVisibleTo(group, seat) {
  if (group.seats === void 0) return true;
  return seat !== void 0 && group.seats.includes(seat);
}
function sortGroupIds(ids) {
  return [...new Set(ids)].sort((left, right) => {
    const leftIndex = GROUP_ORDER.indexOf(left);
    const rightIndex = GROUP_ORDER.indexOf(right);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.localeCompare(right);
  });
}
var COUNCIL_LABEL_SEATS = Object.freeze([
  [/^council chair:/i, "chair"],
  [/^council referee:/i, "referee"],
  [/^council broker:/i, "broker"]
]);
function seatOfDescriptorLabel(label) {
  if (typeof label !== "string") return void 0;
  const trimmed = label.trim();
  if (trimmed === "") return void 0;
  const seat = /^[a-z0-9][a-z0-9-]*\s+seat:\s*([a-z0-9][a-z0-9-]*)$/i.exec(trimmed);
  if (seat !== null && seat[1] !== void 0) return seat[1].toLowerCase();
  for (const [pattern, seatId] of COUNCIL_LABEL_SEATS) {
    if (pattern.test(trimmed)) return seatId;
  }
  return void 0;
}
var RESERVED_PRESENTATION_NAMES = /* @__PURE__ */ new Set(["run_code"]);
function denyNames(catalog, attached) {
  const denied = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of catalog.groups) {
    const hidden = !group.enabled || group.mode === "on-demand" && !attached.has(group.id);
    if (!hidden) continue;
    for (const member of group.members) {
      if (seen.has(member) || RESERVED_PRESENTATION_NAMES.has(member)) continue;
      seen.add(member);
      denied.push(member);
    }
  }
  return denied;
}
function planGroupAction(catalog, attached, action, groupId, seat) {
  const group = catalog.byId.get(groupId);
  if (group === void 0) {
    const known = catalog.groups.map((candidate) => candidate.id).join(", ");
    return { ok: false, reason: `unknown tool group "${groupId}" (known: ${known})` };
  }
  if (!groupVisibleTo(group, seat)) {
    return { ok: false, reason: `tool group "${groupId}" is reserved for the ${(group.seats ?? []).join("/")} seat` };
  }
  if (!group.enabled) {
    return { ok: false, reason: `tool group "${groupId}" is disabled by the operator` };
  }
  if (group.mode === "static") {
    return { ok: false, reason: `tool group "${groupId}" is always on; there is nothing to ${action}` };
  }
  if (action === "attach") {
    if (attached.has(groupId)) return { ok: false, reason: `tool group "${groupId}" is already attached` };
    return { ok: true, attached: sortGroupIds([...attached, groupId]) };
  }
  if (!attached.has(groupId)) return { ok: false, reason: `tool group "${groupId}" is not attached` };
  return { ok: true, attached: sortGroupIds([...attached].filter((id) => id !== groupId)) };
}
function renderMenuText(catalog, attached, pending = [], seat) {
  const pendingSet = new Set(pending);
  const lines = [];
  for (const group of catalog.groups) {
    if (group.mode !== "on-demand" || !group.enabled || !groupVisibleTo(group, seat)) continue;
    const state = pendingSet.has(group.id) ? "attached \u2014 applies from the next turn" : attached.has(group.id) ? "attached" : "not attached";
    lines.push(`- ${group.id} \u2014 ${group.purpose} (${String(group.members.length)} tools, ${state})`);
  }
  if (lines.length === 0) return "";
  return [
    'Tool groups \u2014 extra tool families stay off until attached. Call tool_groups with action "attach" and the group id to add one; its tools appear in your tool list from the next turn. Detach the same way when a family is no longer needed.',
    ...lines
  ].join("\n");
}

// src/projection.ts
import { z } from "zod";
var toolGroupsStateSchema = z.object({
  attached: z.array(z.string().min(1)).nullable()
});
function applyToolGroupsProjection(state, event) {
  if (event.type !== "tool-groups/change") return state;
  return { attached: [...new Set(event.data.attached)] };
}
var toolGroupsProjection = {
  key: "toolGroups",
  stateSchema: toolGroupsStateSchema,
  init: () => ({ attached: null }),
  apply: applyToolGroupsProjection,
  stateVersion: 1
};

// src/index.ts
var name = "enpoi-tool-groups";
var inject = ["tools", "systemPrompt"];
var Config = Schema.object({
  seat: Schema.string().default("default")
});
var TOOL_GROUPS_TOOL = "tool_groups";
var TOOL_GROUPS_MENU_ORDER = 2950;
var CHANGE_EVENT = "tool-groups/change";
var PRESET_SELECTED_EVENT = "agent-preset/selected";
function scopeInstaller(ctx) {
  const scopes = /* @__PURE__ */ new WeakMap();
  return {
    install(agent, deny) {
      let scope = scopes.get(agent);
      if (scope === void 0) {
        scope = createScope(ctx, agent);
        scopes.set(agent, scope);
      }
      return scope.ctx.tools.restrict({ deny: [...deny] });
    },
    release(agent) {
      const scope = scopes.get(agent);
      if (scope === void 0) return;
      scopes.delete(agent);
      void scope.dispose();
    }
  };
}
function agentIdOfScope(scope) {
  if (scope === null || typeof scope !== "object") return void 0;
  const candidate = scope;
  return typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : void 0;
}
function reportIncident(ctx, kind, message) {
  try {
    const diagnostics = ctx.get("diagnostics");
    if (typeof diagnostics?.report !== "function") return;
    diagnostics.report({ kind, message });
  } catch {
  }
}
function parseAction(args) {
  const record = args !== null && typeof args === "object" ? args : {};
  const action = record["action"];
  if (action !== "list" && action !== "attach" && action !== "detach") {
    return { error: `action must be one of "list", "attach", "detach" (got ${JSON.stringify(action)})` };
  }
  const group = record["group"];
  if (group !== void 0 && (typeof group !== "string" || group.length === 0)) {
    return { error: "group must be a non-empty string when provided" };
  }
  return group === void 0 ? { action } : { action, group };
}
var OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    action: { type: "string" },
    group: { type: "string", description: "The group the action named; empty for list." },
    attached: {
      type: "array",
      items: { type: "string" },
      description: "The complete attached group-id set after the action (durable; applied at the next turn boundary)."
    },
    groups: {
      type: "array",
      description: "Every enabled on-demand group with its purpose, members, and current attach state.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          purpose: { type: "string" },
          mode: { type: "string" },
          enabled: { type: "boolean" },
          attached: { type: "boolean" },
          members: { type: "array", items: { type: "string" } }
        },
        required: ["id", "label", "purpose", "mode", "enabled", "attached", "members"]
      }
    },
    reason: { type: "string", description: "Refusal reason; empty on success." }
  },
  required: ["ok", "action", "group", "attached", "groups", "reason"]
};
function renderValue(value) {
  const lines = [];
  if (!value.ok) {
    lines.push(`tool_groups ${value.action} refused: ${value.reason}`);
  } else if (value.action === "list") {
    lines.push(`tool_groups: attached [${value.attached.join(", ")}]`);
  } else if (value.action === "attach") {
    lines.push(`tool_groups attach ${value.group}: ATTACHED. Its tools are NOT in your tool list yet, and calling them now fails. END YOUR TURN NOW \u2014 they become callable from the next turn; do not retry them in this turn.`);
  } else {
    lines.push(`tool_groups detach ${value.group}: DETACHED. Its tools leave your tool list from the next turn; calls already running still finish.`);
  }
  for (const group of value.groups) {
    lines.push(`- ${group.id} (${group.mode}${group.enabled ? "" : ", disabled"}${group.attached ? ", attached" : ""}): ${group.purpose} \u2014 ${group.members.join(", ")}`);
  }
  return lines.join("\n");
}
function apply(ctx, config = {}, seams = {}) {
  try {
    mount(ctx, config, seams);
  } catch (error) {
    const message = `enpoi-tool-groups mount failed: ${error instanceof Error ? error.message : String(error)}`;
    ctx.logger?.error?.(message);
    reportIncident(ctx, "tool-groups/mount-failed", message);
    throw error;
  }
}
function mount(ctx, config, seams) {
  const seat = config.seat ?? "default";
  const installer = seams.installer ?? scopeInstaller(ctx);
  let projections = seams.projections === void 0 ? ctx.get("sessionProjections") ?? null : seams.projections;
  const settings = seams.settings ?? ctx.get("settings");
  const states = /* @__PURE__ */ new Map();
  const reportedInert = /* @__PURE__ */ new Set();
  const catalog = () => resolveToolGroups(readOrchestrationDocument(settings));
  const seatOfAgent = (agent) => {
    try {
      const events = agent.session.ownEvents?.() ?? [];
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type !== "subagent/descriptor") continue;
        const label = typeof event.data?.label === "string" ? event.data.label : void 0;
        return seatOfDescriptorLabel(label) ?? seat;
      }
    } catch {
    }
    return seat;
  };
  const plannedAttached = (agent, groups) => {
    if (projections === null) return null;
    try {
      const state = projections.stateOf(agent.session, "toolGroups");
      return state?.attached ?? preAttachFor(groups, seatOfAgent(agent));
    } catch {
      return null;
    }
  };
  const applyEffective = (state, groups, effective) => {
    if (state.restriction !== void 0) {
      state.restriction();
      state.restriction = void 0;
    }
    if (effective === null) {
      state.applied = null;
      return;
    }
    const deny = denyNames(groups, new Set(effective));
    if (deny.length === 0) {
      state.applied = effective;
      return;
    }
    try {
      state.restriction = installer.install(state.agent, deny);
      state.applied = effective;
    } catch (error) {
      state.applied = null;
      const id = state.agent.session.id;
      const detail = `enpoi-tool-groups: restriction install failed for ${id}: ${String(error)}`;
      ctx.logger?.warn(detail);
      if (!reportedInert.has(id)) {
        reportedInert.add(id);
        reportIncident(ctx, "tool-groups/inert", `${detail}; the presentation filter is failing open for this session`);
      }
    }
  };
  const ensure = (agent) => {
    const id = agent.session?.id;
    if (typeof id !== "string" || id.length === 0) return void 0;
    let state = states.get(id);
    if (state === void 0) {
      state = { agent, applied: null, restriction: void 0 };
      states.set(id, state);
    }
    const groups = catalog();
    applyEffective(state, groups, plannedAttached(agent, groups));
    return state;
  };
  const safeEnsure = (agent) => {
    try {
      ensure(agent);
    } catch (error) {
      ctx.logger?.warn(`enpoi-tool-groups: ensure failed for ${String(agent.session?.id)}: ${String(error)}`);
    }
  };
  if (projections !== null) {
    try {
      ctx.get("sessionProjections")?.register(toolGroupsProjection);
    } catch (error) {
      const detail = `enpoi-tool-groups: projection registration failed; durable attach unavailable and the presentation filter fails open: ${String(error)}`;
      ctx.logger?.error?.(detail);
      reportIncident(ctx, "tool-groups/inert", detail);
      projections = null;
    }
  }
  ctx.systemPrompt.section({
    name: "tool-groups:menu",
    order: TOOL_GROUPS_MENU_ORDER,
    text: (context) => {
      const id = agentIdOfScope(context.scope);
      if (id === void 0) return "";
      let state = states.get(id);
      if (state === void 0) {
        safeEnsure(context.scope);
        state = states.get(id);
      }
      const groups = catalog();
      const appliedSet = new Set(state?.applied ?? []);
      const durable = state === void 0 ? null : plannedAttached(state.agent, groups);
      const pending = durable?.filter((groupId) => !appliedSet.has(groupId)) ?? [];
      return renderMenuText(groups, appliedSet, pending, seatOfAgent(context.scope));
    }
  });
  ctx.tools.register({
    name: TOOL_GROUPS_TOOL,
    description: "List, attach, or detach on-demand tool groups. On-demand groups (peer interconnect, debug/observability) stay out of the tool list until attached; after `attach` the group's tools become callable only FROM THE NEXT TURN, so end the turn after attaching before calling them. Static groups are always on and cannot be attached or detached.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "attach", "detach"], description: "list shows every group and its state; attach adds an on-demand group; detach removes it." },
        group: { type: "string", description: "Group id; required for attach and detach, ignored for list." }
      },
      required: ["action"]
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderValue(value) }]
    },
    // Mutates the session's attached set: never overlap with sibling calls.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const parsed = parseAction(args);
      const agent = exec?.agent;
      const empty = (action2, group, reason) => ({ ok: false, action: action2, group, attached: [], groups: [], reason });
      if ("error" in parsed) return empty("invalid", "", parsed.error);
      const { action } = parsed;
      const groupId = parsed.group ?? "";
      if (agent === void 0) return empty(action, groupId, "tool_groups requires a live session scope");
      const state = states.get(agent.session.id) ?? ensure(agent);
      if (state === void 0) return empty(action, groupId, "tool_groups requires a live session scope");
      const groups = catalog();
      const applied = state.applied ?? [];
      const durable = plannedAttached(agent, groups);
      const attached = durable ?? applied;
      const seat2 = seatOfAgent(agent);
      const rows = groups.groups.filter((group) => group.mode === "on-demand" && group.enabled && groupVisibleTo(group, seat2)).map((group) => ({
        id: group.id,
        label: group.label,
        purpose: group.purpose,
        mode: group.mode,
        enabled: group.enabled,
        attached: attached.includes(group.id),
        members: [...group.members]
      }));
      if (action === "list") {
        return { ok: true, action, group: "", attached: [...attached], groups: rows, reason: "" };
      }
      if (groupId.length === 0) return empty(action, groupId, `action "${action}" requires a group id`);
      if (durable === null) {
        return empty(action, groupId, "tool groups are unavailable in this session (the presentation filter is failing open)");
      }
      const planned = planGroupAction(groups, new Set(durable), action, groupId, seat2);
      if (!planned.ok) return empty(action, groupId, planned.reason);
      agent.session.append(CHANGE_EVENT, { attached: [...planned.attached] }, { ignorable: true });
      return { ok: true, action, group: groupId, attached: [...planned.attached], groups: rows, reason: "" };
    }
  });
  if (typeof ctx.tools.get === "function" && ctx.tools.get(TOOL_GROUPS_TOOL, scopeOf(ctx)) === void 0) {
    throw new Error(`tool "${TOOL_GROUPS_TOOL}" did not register into this preset scope`);
  }
  const resolved = catalog();
  const onDemand = resolved.groups.filter((group) => group.mode === "on-demand" && group.enabled).map((group) => group.id);
  const log = seams.log ?? ((line) => {
    process.stderr.write(line);
  });
  log(`[enpoi-tool-groups] mounted (seat=${seat}, ${String(resolved.groups.length)} groups, on-demand: ${onDemand.join(", ") || "none"})
`);
  ctx.on("agent/created", ({ agent }) => {
    safeEnsure(agent);
  });
  ctx.on("agent/disposed", ({ agent }) => {
    const state = states.get(agent.session.id);
    if (state === void 0) return;
    state.restriction?.();
    state.restriction = void 0;
    installer.release(agent);
    states.delete(agent.session.id);
  });
  const metaDisabled = () => {
    try {
      const document = readOrchestrationDocument(settings);
      const capabilities = document?.["capabilities"];
      return capabilities?.tools?.[TOOL_GROUPS_TOOL] === false;
    } catch {
      return false;
    }
  };
  const actionPolicy = (exec) => {
    if (exec.name !== TOOL_GROUPS_TOOL || metaDisabled()) return void 0;
    const parsed = parseAction(exec.arguments);
    if ("error" in parsed) return void 0;
    if (parsed.action === "list") return { kind: "allow" };
    const agent = exec.agent;
    const groupId = parsed.group;
    if (agent === void 0 || groupId === void 0 || groupId.length === 0) return void 0;
    const declared = preAttachFor(catalog(), seatOfAgent(agent));
    return declared.includes(groupId) ? { kind: "allow" } : void 0;
  };
  const groupCallHint = (exec) => {
    const agent = exec.agent;
    if (agent === void 0) return void 0;
    const state = states.get(agent.session.id);
    if (state === void 0) return void 0;
    const groups = catalog();
    const callable = new Set(state.applied ?? []);
    const durable = new Set(plannedAttached(agent, groups) ?? callable);
    for (const group of groups.groups) {
      if (group.mode !== "on-demand" || !group.members.includes(exec.name)) continue;
      if (!group.enabled) {
        return `tool "${exec.name}" belongs to tool group "${group.id}", which is disabled by the operator and can never be attached.`;
      }
      if (durable.has(group.id) && !callable.has(group.id)) {
        return `tool "${exec.name}" belongs to tool group "${group.id}", which was attached this turn and is NOT callable yet. End your turn now \u2014 it becomes available from the next turn; do not retry it in this turn.`;
      }
      if (!durable.has(group.id)) {
        return `tool "${exec.name}" belongs to tool group "${group.id}", which is not attached. Call tool_groups with action "attach" and group "${group.id}" first; its tools become callable from the next turn.`;
      }
      return void 0;
    }
    return void 0;
  };
  ctx.on("tools/pre-execute", (exec, next) => {
    const hint = groupCallHint(exec);
    return hint === void 0 ? next() : Promise.resolve({ kind: "deny", reason: hint });
  });
  ctx.on("tools/pre-execute", (exec, next) => {
    const decision = actionPolicy(exec);
    return decision === void 0 ? next() : Promise.resolve(decision);
  }, { prepend: true });
  ctx.on("session/event", (session, event) => {
    if (event.type === "turn/end") {
      const state = states.get(session.id);
      if (state !== void 0) safeEnsure(state.agent);
      return;
    }
    if (event.type === PRESET_SELECTED_EVENT) {
      const state = states.get(session.id);
      if (state !== void 0) safeEnsure(state.agent);
    }
  });
}
export {
  Config,
  SHIPPED_TOOL_GROUPS,
  TOOL_GROUPS_MENU_ORDER,
  TOOL_GROUPS_TOOL,
  apply,
  applyToolGroupsProjection,
  denyNames,
  groupVisibleTo,
  inject,
  name,
  planGroupAction,
  preAttachFor,
  renderMenuText,
  resolveToolGroups,
  seatOfDescriptorLabel,
  toolGroupsProjection
};
