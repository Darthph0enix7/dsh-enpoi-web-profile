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
  | {
    kind: 'ask'
    reason: string
    source: string
    /** The grant tier that can absorb this ask. */
    grantTier: 'pattern' | 'tool'
    /** The pattern that asked (grantTier 'pattern'). */
    pattern?: string
    /**
     * Present when the ask can be answered with a BROAD standing grant: the
     * shell verb ("rm") the approval card labels its explicit "allow all"
     * action with. Absent means the card offers only the default action, which
     * for danger-list verbs pins the exact raw command.
     */
    broadAllow?: { label: string }
  }

/** Tools treated as mutations for the read-only session veto. */
const MUTATION_TOOLS = new Set(['bash', 'edit', 'write', 'str_replace_editor'])

/**
 * Whether an asking session runs in Full access: approval prompts disabled AND
 * the danger-full-access sandbox. That pair is the operator's standing consent
 * (Adam's corrected model, 2026-09-28): a MAIN/root session in this mode
 * resolves every ask-policy call as allowed without a card, rails included. A
 * delegated child never uses this helper — its ask is forwarded to the parent.
 * @param approvalPolicy - the session's effective approval policy.
 * @param sandboxMode - the session's current sandbox mode.
 * @returns `true` only for the Full-access pair.
 */
export function isFullAccessMode(approvalPolicy: string | undefined, sandboxMode: string | undefined): boolean {
  return approvalPolicy === 'never' && sandboxMode === 'danger-full-access'
}

/** The allow reason a Full-access ask resolves with: the mode IS the consent. */
export const FULL_ACCESS_ASK_REASON = "approved by the session's Full access mode"

/** The dedicated reviewer-exec tool: fixed read-only test runs, reviewer seats only. */
export const REVIEW_RUN_TOOL = 'review_run'

/**
 * Role ids that hold {@link REVIEW_RUN_TOOL} when they ARE the session's
 * preset (root seats, switched seats). A delegated child does NOT carry its
 * role id — F's `childSessionMeta` copies the parent's composed preset — so
 * children are identified by {@link reviewerSeatOf}'s descriptor check
 * instead.
 */
export const REVIEW_ROLES: ReadonlySet<string> = new Set([
  'oracle', 'reviewer', 'critic', 'referee', 'chair', 'skeptic', 'architect', 'pragmatist',
])

/**
 * Descriptor-label prefixes the reviewer-spawning tools set on their child.
 * The label is authored by server-side spawn code (never model input), and
 * P-owned reviewer tools adopt it: `oracle_review` labels its child
 * `oracle review: …`; the generic delegation tool labels children
 * `<role>: <description>`. A future reviewer tool must add its prefix here.
 */
export const REVIEW_CHILD_LABEL_PREFIXES: readonly string[] = Object.freeze([
  'oracle review:', 'reviewer:', 'critic:', 'referee:', 'chair:', 'skeptic:', 'architect:', 'pragmatist:',
])

/** Reviewer personas as authored by the spawning reviewer tools (defense in depth when the label convention drifts). */
const REVIEW_CHILD_PERSONA = /^you are the (?:oracle|reviewer|critic|referee|chair|skeptic|architect|pragmatist)\b/i

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

/**
 * The danger-list verbs as a set: the same vocabulary {@link DANGER_VERBS}
 * scans for, used to name the broad action ("allow all rm"). `mkfs.ext4`
 * normalizes to `mkfs` for membership, and the LABEL keeps the argv0 spelling.
 */
const DANGER_VERB_SET: ReadonlySet<string> = new Set([
  'rm', 'rmdir', 'unlink', 'dd', 'mkfs', 'fdisk', 'sfdisk', 'parted', 'shutdown',
  'reboot', 'poweroff', 'halt', 'wipefs', 'shred', 'chmod', 'chown', 'mount',
  'umount', 'kill', 'pkill', 'killall', 'truncate',
])

/**
 * The danger-list verb a bash rule pattern asks for, or `undefined` for an
 * ordinary rule. The verb is the pattern's argv0 without a trailing star
 * (`rm`/`rm *` → `rm`, `dd*` → `dd`, `chmod -R *` → `chmod`); a versioned
 * binary normalizes for membership but keeps its spelling as the label.
 * @param pattern - one bash rule pattern.
 * @returns the verb label when the rule is a danger-list rail, else undefined.
 */
export function dangerVerbOfPattern(pattern: string): string | undefined {
  const trimmed = pattern.trim()
  if (trimmed === '' || trimmed === '*') return undefined
  const argv0 = (trimmed.split(/\s+/)[0] ?? '').replace(/\*+$/, '')
  if (argv0 === '' || argv0.includes('/')) return undefined
  const base = argv0.includes('.') ? argv0.slice(0, argv0.indexOf('.')) : argv0
  return DANGER_VERB_SET.has(base) ? argv0 : undefined
}

/** The pattern-ask shape carrying a danger-list verb's broad-action offer. */
function patternAsk(pattern: string, reason: string, source: string): PolicyDecision {
  const verb = dangerVerbOfPattern(pattern)
  return {
    kind: 'ask',
    reason,
    source,
    grantTier: 'pattern',
    pattern,
    ...verb !== undefined ? { broadAllow: { label: verb } } : {},
  }
}

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
      if (policy === 'ask') return patternAsk(pattern, `bash rule "${pattern}" requires approval`, `agent pattern:${pattern}`)
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
    if (policy === 'ask') return patternAsk(pattern, `bash rule "${pattern}" requires approval`, `pattern:${pattern}`)
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
  /**
   * Whether the caller is a reviewer/oracle seat per {@link reviewerSeatOf}.
   * Callers with the live agent object must compute this; role-less delegated
   * children can only be identified through their subagent descriptor.
   */
  reviewer?: boolean
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
    ownEvents?: () => readonly {
      type?: string
      data?: { agentPreset?: unknown; label?: unknown; persona?: unknown }
    }[]
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
 * Whether the live caller is a reviewer/oracle seat. Two independent signals:
 * the role id ({@link agentRoleOf} — a root/switched seat), and, for a
 * delegated child, the NEWEST `subagent/descriptor` in its own log. Delegated
 * children inherit the PARENT's preset (F's `childSessionMeta` copies
 * `composedPreset(parent)`), so the role alone can never identify a reviewer
 * child; the descriptor is written by the spawning tool's own code and
 * reviewer tools label their children with
 * {@link REVIEW_CHILD_LABEL_PREFIXES}. The scan stops at the first (newest)
 * descriptor: a child gets exactly one at creation.
 * @param agent - the live caller.
 * @param readCurrentPreset - optional current-preset projection reader.
 * @returns true only for a reviewer/oracle seat.
 */
export function reviewerSeatOf(
  agent: AgentLike | undefined,
  readCurrentPreset?: (session: unknown) => string | undefined,
): boolean {
  const role = agentRoleOf(agent, readCurrentPreset)
  if (role !== undefined && REVIEW_ROLES.has(role)) return true
  const events = agent?.session?.ownEvents?.() ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'subagent/descriptor') continue
    const label = typeof event.data?.label === 'string' ? event.data.label.toLowerCase() : ''
    if (REVIEW_CHILD_LABEL_PREFIXES.some(prefix => label.startsWith(prefix))) return true
    const persona = typeof event.data?.persona === 'string' ? event.data.persona : ''
    return REVIEW_CHILD_PERSONA.test(persona)
  }
  return false
}

/**
 * The complete policy resolution for one tool call (doc 55, Oracle-amended).
 * Deny terminates at the first hit anywhere; grants only short-circuit an ask
 * at the granularity the ask arose at (a pattern ask is absorbed only by a
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
      if (sawAsk.grantTier === 'pattern' && sawAsk.pattern !== undefined) {
        // A danger-list ask's default "always allow" pins the exact raw command
        // (broadAllow present); that exact pin re-allows exactly this command.
        if (sawAsk.broadAllow !== undefined
          && grantsShortCircuit(toolName, who, input.config.grants, 'pattern', command)) {
          return { kind: 'allow', source: 'grant:command' }
        }
        // The explicit broad action pins the rule-level pattern.
        if (grantsShortCircuit(toolName, who, input.config.grants, 'pattern', sawAsk.pattern)) {
          return { kind: 'allow', source: `grant:pattern:${sawAsk.pattern}` }
        }
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
        reason: `command runs ${opaque.split(/\s+/)[0]}, which can execute arbitrary code — approve explicitly; to read, decode, or search files use the read, grep, or glob tools instead`,
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
        reason: 'command embeds a shell expansion or wrapper containing a destructive verb — approve explicitly; to read file contents use the read tool (or grep/glob to search) instead',
        source: 'scan:hidden-danger',
        grantTier: 'pattern',
        pattern: command,
      }
    }
    return { kind: 'allow', source: firstAllow?.source ?? 'policy:all-subcommands-allowed' }
  }

  // The dedicated read-only test-run capability (reviewer-exec): a reviewer
  // seat never has to ask — the capability itself is the narrow, fixed surface.
  // Every other role is denied outright, so this grants nothing to workers.
  if (toolName === REVIEW_RUN_TOOL) {
    return input.reviewer === true || REVIEW_ROLES.has(agent)
      ? { kind: 'allow', source: 'review:seat' }
      : { kind: 'deny', reason: `review_run is available only to reviewer/oracle seats (role ${agent})`, source: 'review:seat' }
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
 * The tool names an agent's model-facing surface keeps under its permission
 * policy. Only a tool that can never run is dropped: a `deny` resolution is
 * final — no user can answer it and the executor hard-denies every call — so
 * an explicitly denied tool is absent from the advertised surface rather than
 * shown and refused (Adam's corrected model, 2026-09-28). An `ask` stays
 * visible because it is answerable: by the human card, by the parent (the
 * doc-55 forwarding path for a delegated child), or by the session's own
 * Full-access mode (the operator's standing consent). A grant resolves the
 * tool to `allow` in {@link resolvePolicy} and keeps it visible; `allow` tools
 * are out of scope here.
 * @param toolNames - the assembled wire tool names.
 * @param approvalPolicy - the agent's effective approval policy. Retained for
 * call-site clarity and future mode-specific rules; the deny filter above
 * applies under every mode (a deny is never answerable).
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
  void approvalPolicy
  return toolNames.filter(toolName => !neverRunsTool(toolName, input))
}

/**
 * Whether one tool can never run for an agent: only a decision that stays
 * `deny` is impossible — a tool-level deny row, the unknown-tools deny
 * default, the read-only session veto, or a role-gated deny — because an `ask`
 * is answerable (human card, forwarded parent ask, or the session's own
 * Full-access mode). bash is judged by its tool-level row: its command-less
 * resolution is the empty-command guard, not a policy on bash itself.
 * @param toolName - the assembled wire tool name.
 * @param input - resolution context (agent role, permission config, sandbox, MCP catalog).
 * @returns whether the tool has no runnable path for that agent.
 */
function neverRunsTool(
  toolName: string,
  input: {
    agent?: string
    config: PermissionPolicyConfig
    sandboxMode?: string
    mcpServerNames?: readonly string[]
  },
): boolean {
  if (toolName === 'bash') {
    const agentBash = input.agent !== undefined ? input.config.agents?.[input.agent]?.tools?.bash : undefined
    const policy = agentBash ?? input.config.tools?.bash ?? SHIPPED_TOOL_DEFAULTS.bash ?? 'ask'
    return policy === 'deny'
  }
  const decision = resolvePolicy({
    toolName,
    agent: input.agent,
    config: input.config,
    sandboxMode: input.sandboxMode,
    mcpServerNames: input.mcpServerNames,
  })
  return decision.kind === 'deny'
}

/** True when toolName is an MCP-namespaced tool (mcp__server__tool). */
export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith('mcp__')
}

/** The grant a host-side "allow always" should write for one ask (proposal). */
export interface GrantProposal {
  tool: string
  /**
   * The DEFAULT always-allow pin. For danger-list verbs and the opaque/hidden
   * scans this is the exact raw command; for an ordinary bash rule ask it is
   * the matched rule pattern (historical behavior).
   */
  pattern?: string
  /**
   * Present only when the ask offered the explicit broad action
   * ({@link PolicyDecision.broadAllow}): the rule-level pattern that action
   * pins ("allow all rm"). The default outcome must never write it.
   */
  broadPattern?: string
  /** The requesting agent (recorded on the grant; does not scope it). */
  agent?: string
}

/**
 * Derive the standing-grant proposal from an ask decision + call context.
 * A danger-list ask offers two pins: the default exact raw command and the
 * explicit broad rule pattern. Every other ask keeps its historical single
 * proposal (the rule pattern, or the exact command for the scans).
 */
export function grantProposalFor(decision: PolicyDecision & { kind: 'ask' }, toolName: string, command: string | undefined, agent: string | undefined): GrantProposal {
  if (decision.grantTier === 'pattern' && decision.pattern !== undefined) {
    if (decision.broadAllow !== undefined && command !== undefined && command.trim() !== '') {
      return { tool: toolName, pattern: command, broadPattern: decision.pattern, agent }
    }
    return { tool: toolName, pattern: decision.pattern, agent }
  }
  return { tool: toolName, agent }
}

/**
 * The proposal one host-side always-allow decision writes: the explicit broad
 * action writes the broad rule pattern when the ask offered one; every other
 * outcome (including a broad answer to an ask that offers none) writes the
 * default proposal.
 * @param proposal - the ask's stashed dual proposal.
 * @param broad - whether the decided outcome was the explicit broad action.
 * @returns the proposal to persist.
 */
export function grantProposalForOutcome(proposal: GrantProposal, broad: boolean): GrantProposal {
  if (!broad || proposal.broadPattern === undefined) return proposal
  return { tool: proposal.tool, pattern: proposal.broadPattern, ...proposal.agent !== undefined ? { agent: proposal.agent } : {} }
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
