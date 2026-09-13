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
  // MCP Servers (Default OFF per user directive)
  { id: "plane-mcp", name: "Plane MCP", kind: "mcp", category: "mcp", description: "Project management and backlog tooling", defaultEnabled: false },
  { id: "ue-mcp", name: "Unreal Engine MCP", kind: "mcp", category: "mcp", description: "Unreal Engine editor automation and actor controls", defaultEnabled: false },
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

// src/enforcement.ts
function evaluateToolCall(toolName, args, state) {
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
    const parts = toolName.split("__");
    const serverPrefix = parts[1]?.toLowerCase();
    if (serverPrefix) {
      const mcpKey = serverPrefix === "plane" ? "plane-mcp" : serverPrefix === "ue" || serverPrefix === "unreal" ? "ue-mcp" : `${serverPrefix}-mcp`;
      if (state.mcp[mcpKey] === false || state.mcp[serverPrefix] === false) {
        return {
          allowed: false,
          syntheticResult: `[CAPABILITY_DISABLED] MCP Tool suite '${mcpKey}' is currently disabled by operator preference for this query. Do not attempt to invoke it in this turn.`
        };
      }
    }
  }
  return { allowed: true };
}

// src/index.ts
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
  parameters: Schema.any(),
  uiPreferences: Schema.any()
});
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
  const disposeGuard = ctx.tools.guard((exec) => {
    const decision = evaluateToolCall(exec.name, exec.arguments, initialCapabilitiesState(getGlobalDefaults()));
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
    async function syncMcpMounts() {
      const state = initialCapabilitiesState(getGlobalDefaults());
      const catalog = getServerCatalog();
      const want = new Set(
        Object.entries(catalog).filter(([id]) => state.mcp[id] === true).map(([id]) => id)
      );
      if (want.size > 0 || mounted.size > 0) {
        process.stderr.write(`[enpoi-capabilities] mcp sync: want=[${[...want].join(",")}] mounted=[${[...mounted.keys()].join(",")}]
`);
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
        } catch (error) {
          process.stderr.write(`[enpoi-capabilities] mcp mount failed for ${id}: ${String(error)}
`);
        } finally {
          mountedPending.delete(id);
        }
      }
    }
    void syncMcpMounts();
    ctx.setTimeout(() => void syncMcpMounts(), 3e3);
    ctx.on("settings/updated", ((ns) => {
      if (String(ns) !== "enpoi-orchestration") return;
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
        next[id] = { state: probe.state, mounted: false, checkedAt: Date.now(), ...probe.authError ? { authError: true } : {} };
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
  ctx.on("agent/pre-step", (async (_params, next) => {
    const decision = await next();
    if (decision.kind !== "enter") return decision;
    const messages = decision.messages;
    if (!Array.isArray(messages)) return decision;
    const state = initialCapabilitiesState(getGlobalDefaults());
    const disabledSkillIds = new Set(
      Object.entries(state.skills).filter(([, enabled]) => enabled === false).map(([id]) => id)
    );
    if (disabledSkillIds.size === 0) return decision;
    const filtered = messages.map((msg) => {
      const source = msg.source;
      if (source?.kind !== "skill-catalog") return msg;
      const content = msg.content;
      if (!Array.isArray(content)) return msg;
      const newContent = content.map((block) => {
        if (block.type !== "text" || typeof block.text !== "string") return block;
        const lines = block.text.split("\n");
        const kept = lines.filter((line) => {
          const m = line.match(/^- `([^`]+)`:/);
          if (!m) return true;
          return !disabledSkillIds.has(m[1]);
        });
        return { ...block, text: kept.join("\n") };
      });
      return { ...msg, content: newContent };
    });
    return { ...decision, messages: filtered };
  }));
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
  name
};
