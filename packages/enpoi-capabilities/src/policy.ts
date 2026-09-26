/**
 * enpoi-capabilities — Permission policy resolver (pure).
 *
 * Doc 55: OpenCode-grade per-tool/per-command policy with per-agent overrides,
 * standing allow-always grants, MCP server wildcards, and compound-command
 * aggregation. Resolution is fresh per dispatch; settings.yaml under
 * `enpoi-orchestration.permissions` is the single source of truth (creator-
 * editable); the shipped defaults below are code, not YAML.
 *
 * Resolution order (Oracle plan gate, amended):
 *   capability-disabled → read-only veto → agent bashPatterns → agent tool
 *   → global bashPatterns → global tool → grants (same granularity as the
 *   ask they short-circuit) → MCP wildcards → defaults.unknownTools.
 * Deny terminates immediately; grants NEVER upgrade a deny.
 */

export type PermissionPolicy = 'allow' | 'ask' | 'deny'

export interface BashPattern {
  pattern: string
  policy: PermissionPolicy
}

export interface StandingGrant {
  id: string
  tool: string
  /** Undefined = tool-level grant (applies to every command of the tool). */
  pattern?: string
  /**
   * The agent the grant is scoped to — or, when {@link global} is true, the
   * agent that ASKED for it (audit only, never a scope).
   */
  agent?: string
  /**
   * Host-written grants are global by design: the approval card's
   * "Always allow" covers all agents. `agent` stays on the record for
   * auditability and future per-agent scoping, but a global grant never
   * narrows resolution.
   */
  global?: boolean
  createdAt?: string
}

export interface PermissionPolicyConfig {
  defaults?: { unknownTools?: PermissionPolicy }
  tools?: Record<string, PermissionPolicy>
  bashPatterns?: BashPattern[]
  agents?: Record<string, { tools?: Record<string, PermissionPolicy>; bashPatterns?: BashPattern[] }>
  grants?: Record<string, StandingGrant>
}

export type PolicyDecision =
  | { kind: 'allow'; source: string }
  | { kind: 'deny'; reason: string; source: string }
  | { kind: 'ask'; reason: string; source: string; /** The grant tier that can absorb this ask. */ grantTier: 'pattern' | 'tool'; /** The pattern that asked (grantTier 'pattern'). */ pattern?: string }

/** Tools treated as mutations for the read-only session veto. */
const MUTATION_TOOLS = new Set(['bash', 'edit', 'write', 'str_replace_editor'])

/** Shipped global defaults (user-editable via settings; absent keys fall here). */
export const SHIPPED_TOOL_DEFAULTS: Record<string, PermissionPolicy> = {
  read: 'allow', glob: 'allow', grep: 'allow', read_image: 'allow',
  web_search: 'allow', web_fetch: 'allow',
  todo_write: 'allow', todo_read: 'allow',
  memory_search: 'allow', memory_save: 'allow', memory_rescind: 'allow', memory_confirm: 'allow',
  oracle_review: 'allow', request_evidence: 'allow',
  roundtable: 'allow', chorus: 'allow', subagent: 'allow', task: 'allow',
  job_output: 'allow', job_list: 'allow', job_kill: 'ask',
  skill: 'allow', ask_user_question: 'allow',
  // Read-only introspection: an unattended peer/driver run must be able to look
  // at its own session, diagnostics, and history without parking on an ask
  // nobody is there to answer (observed live: session_debug parked a turn).
  // Mutations keep their policy — registering a council, writing the board, or
  // any execution still asks.
  session_debug: 'allow', diagnostics_report: 'allow', fast_report: 'allow',
  session_search: 'allow', session_trace: 'allow',
  session_event_search: 'allow', session_event_read: 'allow', session_event_trace: 'allow',
  council_list: 'allow',
  // The whiteboard is permanent core orchestrator context (doc 66 §3c/§67 §B):
  // its five per-feature asks fold into ONE family policy (the curated
  // `whiteboard_*` row in the Permissions UI, permissions-model.ts
  // POLICY_FAMILIES). Operator decision 2026-09-26 after granting read/write/
  // pin/unpin per feature; existing standing grants stay on record but are no
  // longer needed to absorb an ask.
  whiteboard_read: 'allow', whiteboard_write: 'allow', whiteboard_pin: 'allow',
  whiteboard_unpin: 'allow', whiteboard_forget: 'allow',
  edit: 'allow', write: 'allow',
  bash: 'ask',
  str_replace_editor: 'ask',
  // Delivery only declares deliverables; no filesystem or network effect. An
  // unattended run must not park on the unknown-tools ask for it. Availability
  // (per-role tools.available / restrict) still gates which agents hold it.
  present: 'allow',
}

export const SHIPPED_BASH_PATTERNS: BashPattern[] = [
  { pattern: 'git *', policy: 'allow' },
  { pattern: 'rm', policy: 'ask' },
  { pattern: 'rm *', policy: 'ask' },
  { pattern: 'rmdir', policy: 'ask' },
  { pattern: 'rmdir *', policy: 'ask' },
  { pattern: 'unlink', policy: 'ask' },
  { pattern: 'unlink *', policy: 'ask' },
  { pattern: 'dd*', policy: 'ask' },
  { pattern: 'mkfs*', policy: 'ask' },
  { pattern: 'fdisk', policy: 'ask' },
  { pattern: 'fdisk *', policy: 'ask' },
  { pattern: 'shutdown', policy: 'ask' },
  { pattern: 'reboot', policy: 'ask' },
  { pattern: 'poweroff', policy: 'ask' },
  { pattern: 'halt', policy: 'ask' },
  { pattern: 'chmod -R *', policy: 'ask' },
  { pattern: 'chown -R *', policy: 'ask' },
  // The OpenCode catch-all: every command not explicitly listed runs free.
  // Only the dangerous list above asks.
  { pattern: '*', policy: 'allow' },
]

/**
 * Split a bash command into top-level sub-commands (Oracle amendment 3):
 * separators `&&`, `||`, `;`, `|`, and newlines at quote depth 0. Quoted
 * segments never split.
 */
export function splitCompoundCommand(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < command.length) {
    const ch = command[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      current += ch
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      i += 1
      continue
    }
    if (ch === '\n') {
      parts.push(current)
      current = ''
      i += 1
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      parts.push(current)
      current = ''
      i += 2
      continue
    }
    if (ch === ';' || ch === '|') {
      parts.push(current)
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }
  parts.push(current)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

/** Strip leading unquoted KEY=VAL environment assignments. */
export function stripEnvPrefixes(subCommand: string): string {
  const tokens = subCommand.trim().split(/\s+/)
  let i = 0
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? '')) i += 1
  return i > 0 ? tokens.slice(i).join(' ') : subCommand.trim()
}

/**
 * One pattern against ONE (env-stripped) sub-command:
 * - bare token (`rm`, no space, no star): argv0 exact match
 * - trailing star binds to ARGUMENTS, never the argv0 prefix (`rm*` ≡ `rm`;
 *   `rmdir` stays a separate token — matching Adam's OpenCode list semantics)
 * - pattern containing a space: glob over the full sub-command string
 */
export function matchBashPattern(pattern: string, subCommand: string): boolean {
  const p = pattern.trim()
  if (p === '*') return true
  const tokens = subCommand.split(/\s+/)
  const argv0 = tokens[0] ?? ''
  if (!p.includes(' ') && !p.includes('*')) return argv0 === p
  if (p.endsWith('*') && !p.slice(0, -1).includes(' ')) {
    return argv0 === p.slice(0, -1)
  }
  const rx = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, ch => (ch === '*' ? '[\\s\\S]*' : `\\${ch}`))}$`)
  return rx.test(subCommand)
}

function policyToDecision(policy: PermissionPolicy, subject: string, source: string): PolicyDecision {
  if (policy === 'deny') return { kind: 'deny', reason: `operator policy denies ${subject}`, source }
  if (policy === 'ask') return { kind: 'ask', reason: `operator policy asks for ${subject} — approve once or always`, source, grantTier: 'tool' }
  return { kind: 'allow', source }
}

/**
 * The mounted server name of one catalog entry: the name the mcp-client
 * registers tools under and the client's permission grouping keys rows by
 * (`serverName ?? id minus the standard -mcp suffix`).
 */
export function mcpServerNameOf(id: string, def?: { serverName?: string } | undefined): string {
  return typeof def?.serverName === 'string' && def.serverName !== '' ? def.serverName : id.replace(/-mcp$/, '')
}

/**
 * The server segment of one MCP public tool name (`mcp__<server>__<tool>`).
 * A known catalog server whose mounted name prefixes the tool name wins,
 * longest first — a server id may itself contain `__`, so `mcp__a__b__tool`
 * belongs to `a__b`, not `a`. The `__` split is only the fallback for a
 * server that left the catalog, exactly like the client's row grouping.
 */
export function mcpServerSegment(toolName: string, knownServers?: readonly string[]): string | undefined {
  if (toolName.startsWith('mcp__') && knownServers !== undefined) {
    const known = knownServers
      .filter(server => server !== '' && toolName.startsWith(`mcp__${server}__`))
      .sort((left, right) => right.length - left.length)[0]
    if (known !== undefined) return known
  }
  const parts = toolName.split('__')
  return parts.length >= 3 ? parts[1] : undefined
}

/** MCP wildcard ladder: exact → server (`mcp__server__*`) → family (`mcp__*`) → `*`. */
export function mcpLadder(
  toolName: string,
  table: Record<string, PermissionPolicy> | undefined,
  knownServers?: readonly string[],
): PolicyDecision | null {
  if (table === undefined) return null
  const check = (key: string): PolicyDecision | null => {
    const policy = table[key]
    if (policy === undefined) return null
    return policy === 'deny'
      ? { kind: 'deny', reason: `operator policy denies ${toolName}`, source: `matrix:${key}` }
      : { kind: 'ask', reason: `operator policy asks for ${key}`, source: `matrix:${key}`, grantTier: 'tool' }
  }
  const exact = check(toolName)
  if (exact !== null) return exact
  const server = mcpServerSegment(toolName, knownServers)
  if (server !== undefined) {
    const hit = check(`mcp__${server}__*`)
    if (hit !== null) return hit
  }
  if (toolName.startsWith('mcp__')) {
    const family = check('mcp__*')
    if (family !== null) return family
  }
  return null
}

/**
 * Grants matching this ask's granularity: a pattern-level grant never bleeds
 * into a tool-level ask and vice versa. A recorded `agent` scopes the grant
 * unless the grant is marked `global` (host-written "Always allow" grants
 * record the asking agent for audit but cover all agents).
 */
export function grantsShortCircuit(
  toolName: string,
  agent: string | undefined,
  grants: Record<string, StandingGrant> | undefined,
  tier: 'pattern' | 'tool',
  pattern: string | undefined,
): boolean {
  if (grants === undefined) return false
  for (const grant of Object.values(grants)) {
    if (grant.tool !== toolName) continue
    if (tier === 'pattern') {
      if (grant.pattern !== pattern) continue
    } else {
      if (grant.pattern !== undefined) continue
    }
    if (grant.global !== true && grant.agent !== undefined && grant.agent !== agent) continue
    return true
  }
  return false
}

/**
 * Shell constructs that can hide a command from per-sub-command evaluation:
 * command substitution, backticks, wrapper shells, eval, xargs, find -exec,
 * process substitution, heredocs.
 */
const HIDDEN_SURFACE = /\$\(|`|\bbash\s+-c\b|\bsh\s+-c\b|\beval\b|\bxargs\b|-exec\b|<\(|<</

/**
 * Dangerous verbs anywhere in the raw text (word-boundary), used ONLY when a
 * hidden surface is present — a plain `git rm` never trips this because its
 * sub-command is evaluated structurally and matched by `git *`.
 */
const DANGER_VERBS = /\b(?:rm|rmdir|unlink|dd|mkfs(?:\.[a-z0-9]+)?|fdisk|sfdisk|parted|shutdown|reboot|poweroff|halt|wipefs|shred|chmod|chown|mount|umount|kill|pkill|killall|truncate)\b/

/** Interpreters whose invocation can execute arbitrary code. */
const OPAQUE_EXECUTORS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'eval', 'source', '.'])

/** Interpreters where only the inline (-c/-e/--eval) form is opaque. */
const INLINE_INTERPRETERS = /^(?:python[0-9.]*|perl|ruby|node|deno|bun|php)$/

/** One sub-command's decision through the four tiers (no grants, no compound). */
function decideSubCommand(
  sub: string,
  config: PermissionPolicyConfig,
  agent: string | undefined,
): PolicyDecision {
  const agentCfg = agent !== undefined ? config.agents?.[agent] : undefined
  // 1. agent bashPatterns → 2. agent tools.bash → 3. global bashPatterns → 4. global tools.bash
  const agentPatterns = agentCfg?.bashPatterns
  if (agentPatterns !== undefined) {
    for (const { pattern, policy } of agentPatterns) {
      if (!matchBashPattern(pattern, sub)) continue
      if (policy === 'deny') return { kind: 'deny', reason: `bash rule "${pattern}" denies this command`, source: `agent pattern:${pattern}` }
      if (policy === 'ask') return { kind: 'ask', reason: `bash rule "${pattern}" requires approval`, source: `agent pattern:${pattern}`, grantTier: 'pattern', pattern }
      return { kind: 'allow', source: `agent pattern:${pattern}` }
    }
  }
  const agentTool = agentCfg?.tools?.bash
  if (agentTool !== undefined) {
    if (agentTool === 'deny') return { kind: 'deny', reason: `agent policy denies bash`, source: `agent:${agent}` }
    if (agentTool === 'ask') return { kind: 'ask', reason: `agent policy asks for bash`, source: `agent:${agent}`, grantTier: 'tool' }
    return { kind: 'allow', source: `agent:${agent}` }
  }
  const globalPatterns = [...(config.bashPatterns ?? []), ...SHIPPED_BASH_PATTERNS]
  for (const { pattern, policy } of globalPatterns) {
    if (!matchBashPattern(pattern, sub)) continue
    if (policy === 'deny') return { kind: 'deny', reason: `bash rule "${pattern}" denies this command`, source: `pattern:${pattern}` }
    if (policy === 'ask') return { kind: 'ask', reason: `bash rule "${pattern}" requires approval`, source: `pattern:${pattern}`, grantTier: 'pattern', pattern }
    return { kind: 'allow', source: `pattern:${pattern}` }
  }
  const globalTool = config.tools?.bash ?? SHIPPED_TOOL_DEFAULTS.bash ?? 'ask'
  if (globalTool === 'deny') return { kind: 'deny', reason: 'operator policy denies bash', source: 'matrix:global' }
  if (globalTool === 'ask') return { kind: 'ask', reason: 'operator policy asks for bash', source: 'matrix:global', grantTier: 'tool' }
  return { kind: 'allow', source: 'matrix:global' }
}

export interface PolicyResolutionInput {
  toolName: string
  /** The raw command (bash only). */
  command?: string
  /** The calling agent's name (role/persona id), when known. */
  agent?: string
  config: PermissionPolicyConfig
  /** Effective sandbox mode; 'read-only' vetoes mutations. */
  sandboxMode?: string
  /** Mounted MCP server names (catalog `serverName ?? id - '-mcp'`) for the wildcard ladder. */
  mcpServerNames?: readonly string[]
}

/**
 * Every policy row belonging to one MCP server: the server wildcard
 * (`mcp__<server>__*`), any exact `mcp__<server>__<tool>` row, at the global
 * tier and under every agent override. `mcp__<server2>__*` never matches for
 * a different server because the `__` separator is part of the prefix.
 */
export function mcpPolicyRemovalOps(
  server: string,
  config: PermissionPolicyConfig | undefined,
): Array<{ op: 'unset'; path: string[] }> {
  const prefix = `mcp__${server}__`
  const ops: Array<{ op: 'unset'; path: string[] }> = []
  for (const key of Object.keys(config?.tools ?? {})) {
    if (key.startsWith(prefix)) ops.push({ op: 'unset', path: ['permissions', 'tools', key] })
  }
  for (const [agent, agentCfg] of Object.entries(config?.agents ?? {})) {
    for (const key of Object.keys(agentCfg?.tools ?? {})) {
      if (key.startsWith(prefix)) ops.push({ op: 'unset', path: ['permissions', 'agents', agent, 'tools', key] })
    }
  }
  return ops
}

/** The live agent slice `exec.agent` exposes to a policy listener. */
export interface AgentLike {
  agentPreset?: string
  preset?: string
  name?: string
  label?: string
  session?: {
    header?: { agentPreset?: string; meta?: { agentPreset?: string } }
    ownEvents?: () => readonly { type?: string; data?: { agentPreset?: unknown } }[]
  }
}

/**
 * The asking agent's role id for a live exec. Precedence: fields the runtime
 * exposes on the agent itself, the session's current-preset projection
 * (`agent-preset/selected` fold, via the injected reader), the session header
 * (creation-time preset — what a child role carries), then the latest logged
 * selection. Returns undefined when the agent is genuinely unidentified.
 */
export function agentRoleOf(
  agent: AgentLike | undefined,
  readCurrentPreset?: (session: unknown) => string | undefined,
): string | undefined {
  if (agent === undefined) return undefined
  for (const candidate of [agent.agentPreset, agent.preset, agent.name, agent.label]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  const session = agent.session
  if (session !== undefined && readCurrentPreset !== undefined) {
    try {
      const current = readCurrentPreset(session)
      if (typeof current === 'string' && current !== '') return current
    } catch {
      // Fall through to the durable header.
    }
  }
  const header = session?.header
  const created = typeof header?.agentPreset === 'string' && header.agentPreset !== ''
    ? header.agentPreset
    : header?.meta?.agentPreset
  if (typeof created === 'string' && created !== '') return created
  try {
    const events = session?.ownEvents?.() ?? []
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const value = events[i]?.data?.agentPreset
      if (events[i]?.type === 'agent-preset/selected' && typeof value === 'string' && value !== '') return value
    }
  } catch {
    // An unreadable log has no evidence.
  }
  return undefined
}

/**
 * The complete policy resolution for one tool call (doc 55, Oracle-amended).
 * Deny terminates at the first hit anywhere; grants only short-circuit an ask
 * at the granularity the ask arose at (a pattern ask is absorbed only by a
 * grant carrying that pattern; a tool-level ask only by a tool-level grant).
 */
export function resolvePolicy(input: PolicyResolutionInput): PolicyDecision {
  const { toolName, command, sandboxMode } = input
  const agent = input.agent ?? '(unknown)'

  // 0. read-only session veto (mutations cannot run in a read-only session).
  if (sandboxMode === 'read-only' && MUTATION_TOOLS.has(toolName)) {
    return { kind: 'deny', reason: `read-only session: ${toolName} mutations are blocked`, source: 'session:read-only' }
  }

  if (toolName === 'bash') {
    if (command === undefined || command.trim().length === 0) {
      return { kind: 'deny', reason: 'empty bash command', source: 'policy:empty' }
    }
    const subs = splitCompoundCommand(command)
    if (subs.length === 0) return { kind: 'deny', reason: 'empty bash command', source: 'policy:empty' }

    let sawAsk: PolicyDecision | null = null
    let firstAllow: PolicyDecision | null = null
    for (const raw of subs) {
      const sub = stripEnvPrefixes(raw)
      const subDecision = decideSubCommand(sub, input.config, agent)
      if (subDecision.kind === 'deny') {
        const suffix = subs.length > 1 ? ' (part of compound command)' : ''
        return { kind: 'deny', reason: `${subDecision.reason}${suffix}`, source: subDecision.source }
      }
      if (subDecision.kind === 'ask' && sawAsk === null) sawAsk = subDecision
      if (subDecision.kind === 'allow' && firstAllow === null) firstAllow = subDecision
    }
    if (sawAsk !== null) {
      const who = input.agent
      if (sawAsk.grantTier === 'pattern' && sawAsk.pattern !== undefined
        && grantsShortCircuit(toolName, who, input.config.grants, 'pattern', sawAsk.pattern)) {
        return { kind: 'allow', source: `grant:pattern:${sawAsk.pattern}` }
      }
      if (sawAsk.grantTier === 'tool' && grantsShortCircuit(toolName, who, input.config.grants, 'tool', undefined)) {
        return { kind: 'allow', source: 'grant:tool' }
      }
      return sawAsk
    }
    // Fail-safe 1: opaque executors. A shell/interpreter invocation can run
    // anything (including `base64 -d | bash` payloads) regardless of the
    // verbs visible in the text — ask explicitly. An Always-allow grant pins
    // the exact raw command string.
    const opaque = subs.map(stripEnvPrefixes).find((sub) => {
      const argv0 = sub.split(/\s+/)[0] ?? ''
      if (OPAQUE_EXECUTORS.has(argv0)) return true
      return INLINE_INTERPRETERS.test(argv0) && /(?:^|\s)(?:-c|-e|--eval)\b/.test(sub)
    })
    if (opaque !== undefined) {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, 'pattern', command)) {
        return { kind: 'allow', source: 'grant:command' }
      }
      return {
        kind: 'ask',
        reason: `command runs ${opaque.split(/\s+/)[0]}, which can execute arbitrary code — approve explicitly`,
        source: 'scan:opaque-executor',
        grantTier: 'pattern',
        pattern: command,
      }
    }
    // Fail-safe 2: hidden surfaces: an otherwise-allowed command that embeds
    // a dangerous verb inside substitution/wrapper syntax asks explicitly.
    // An Always-allow grant pins the exact raw command string.
    if (HIDDEN_SURFACE.test(command) && DANGER_VERBS.test(command)) {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, 'pattern', command)) {
        return { kind: 'allow', source: 'grant:command' }
      }
      return {
        kind: 'ask',
        reason: 'command embeds a shell expansion or wrapper containing a destructive verb — approve explicitly',
        source: 'scan:hidden-danger',
        grantTier: 'pattern',
        pattern: command,
      }
    }
    return { kind: 'allow', source: firstAllow?.source ?? 'policy:all-subcommands-allowed' }
  }

  // Non-bash: agent override → global table → MCP wildcard ladder → default.
  const agentCfg = input.agent !== undefined ? input.config.agents?.[input.agent] : undefined
  const agentPolicy = agentCfg?.tools?.[toolName]
  if (agentPolicy !== undefined) {
    if (agentPolicy === 'deny') return { kind: 'deny', reason: `agent policy denies ${toolName}`, source: `agent:${agent}` }
    if (agentPolicy === 'ask') {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, 'tool', undefined)) {
        return { kind: 'allow', source: 'grant:tool' }
      }
      return { kind: 'ask', reason: `agent policy asks for ${toolName}`, source: `agent:${agent}`, grantTier: 'tool' }
    }
    return { kind: 'allow', source: `agent:${agent}` }
  }
  const globalPolicy = input.config.tools?.[toolName] ?? SHIPPED_TOOL_DEFAULTS[toolName]
  if (globalPolicy !== undefined) {
    if (globalPolicy === 'deny') return { kind: 'deny', reason: `operator policy denies ${toolName}`, source: 'matrix:global' }
    if (globalPolicy === 'ask') {
      if (grantsShortCircuit(toolName, input.agent, input.config.grants, 'tool', undefined)) {
        return { kind: 'allow', source: 'grant:tool' }
      }
      return { kind: 'ask', reason: `operator policy asks for ${toolName}`, source: 'matrix:global', grantTier: 'tool' }
    }
    return { kind: 'allow', source: 'matrix:global' }
  }
  // MCP wildcard ladder at the global tier.
  if (isMcpToolName(toolName)) {
    const ladder = mcpLadder(toolName, input.config.tools, input.mcpServerNames)
    if (ladder !== null) return ladder
  }
  const fallback: PermissionPolicy = input.config.defaults?.unknownTools ?? 'ask'
  if (fallback === 'deny') return { kind: 'deny', reason: `unconfigured tool ${toolName} denied by default`, source: 'defaults' }
  if (fallback === 'ask') {
    if (grantsShortCircuit(toolName, input.agent, input.config.grants, 'tool', undefined)) {
      return { kind: 'allow', source: 'grant:tool' }
    }
    return { kind: 'ask', reason: `unconfigured tool ${toolName} requires approval (default)`, source: 'defaults', grantTier: 'tool' }
  }
  return { kind: 'allow', source: 'defaults' }
}

/**
 * The tool names an agent's model-facing surface keeps under its approval
 * policy. An answerable policy (`ask`, or no logged policy) returns every name
 * unchanged. An impossible one (`never`, e.g. a delegated child) drops every
 * tool whose resolution is `ask`: no user can answer it and the executor
 * auto-denies each call, so advertising it only burns a model call. A grant
 * resolves the tool to `allow` in {@link resolvePolicy} and keeps it visible;
 * `allow`/`deny` tools are out of scope here.
 * @param toolNames - the assembled wire tool names.
 * @param approvalPolicy - the agent's effective approval policy.
 * @param input - resolution context (agent role, permission config, sandbox, MCP catalog).
 * @returns the names to advertise, in input order.
 */
export function advertisedToolNames(
  toolNames: readonly string[],
  approvalPolicy: string | undefined,
  input: {
    agent?: string
    config: PermissionPolicyConfig
    sandboxMode?: string
    mcpServerNames?: readonly string[]
  },
): string[] {
  if (approvalPolicy !== 'never') return [...toolNames]
  return toolNames.filter((toolName) => {
    const decision = resolvePolicy({
      toolName,
      agent: input.agent,
      config: input.config,
      sandboxMode: input.sandboxMode,
      mcpServerNames: input.mcpServerNames,
    })
    return decision.kind !== 'ask'
  })
}

/** True when toolName is an MCP-namespaced tool (mcp__server__tool). */
export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith('mcp__')
}

/** The grant a host-side "allow always" should write for one ask (proposal). */
export interface GrantProposal {
  tool: string
  pattern?: string
  /** The requesting agent (recorded on the grant; does not scope it). */
  agent?: string
}

/** Derive the standing-grant proposal from an ask decision + call context. */
export function grantProposalFor(decision: PolicyDecision & { kind: 'ask' }, toolName: string, command: string | undefined, agent: string | undefined): GrantProposal {
  if (decision.grantTier === 'pattern' && decision.pattern !== undefined) {
    return { tool: toolName, pattern: decision.pattern, agent }
  }
  return { tool: toolName, agent }
}

/**
 * The grant record one host-side "allow always" writes: global (applies to
 * every agent, matching the approval card), with the requesting agent kept on
 * the record for auditability and future per-agent scoping.
 */
export function standingGrantRecord(id: string, proposal: GrantProposal, createdAt: string): StandingGrant {
  return {
    id,
    tool: proposal.tool,
    ...(proposal.pattern !== undefined ? { pattern: proposal.pattern } : {}),
    ...(proposal.agent !== undefined ? { agent: proposal.agent } : {}),
    global: true,
    createdAt,
  }
}
