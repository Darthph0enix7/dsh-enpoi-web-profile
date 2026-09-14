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
  /** Undefined = global (all agents). */
  agent?: string
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
  memory_search: 'allow', memory_save: 'ask', memory_rescind: 'ask', memory_confirm: 'ask',
  oracle_review: 'allow', request_evidence: 'allow',
  roundtable: 'allow', chorus: 'allow', subagent: 'allow', task: 'allow',
  job_output: 'allow', job_list: 'allow', job_kill: 'ask',
  skill: 'allow', ask_user_question: 'allow',
  edit: 'allow', write: 'allow',
  bash: 'ask',
  str_replace_editor: 'ask',
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

/** MCP wildcard ladder: exact → server (`mcp__server__*`) → family (`mcp__*`) → `*`. */
export function mcpLadder(toolName: string, table: Record<string, PermissionPolicy> | undefined): PolicyDecision | null {
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
  const parts = toolName.split('__')   // mcp__<server>__<tool>
  if (parts.length >= 3) {
    const server = check(`mcp__${parts[1]}__*`)
    if (server !== null) return server
  }
  if (toolName.startsWith('mcp__')) {
    const family = check('mcp__*')
    if (family !== null) return family
  }
  return null
}

/** Grants matching this ask's granularity: a pattern-level grant never bleeds into a tool-level ask and vice versa. */
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
    if (grant.agent !== undefined && grant.agent !== agent) continue
    return true
  }
  return false
}

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
    const ladder = mcpLadder(toolName, input.config.tools)
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

/** True when toolName is an MCP-namespaced tool (mcp__server__tool). */
export function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith('mcp__')
}

/** The grant a host-side "allow always" should write for one ask (proposal). */
export interface GrantProposal {
  tool: string
  pattern?: string
  agent?: string
}

/** Derive the standing-grant proposal from an ask decision + call context. */
export function grantProposalFor(decision: PolicyDecision & { kind: 'ask' }, toolName: string, command: string | undefined, agent: string | undefined): GrantProposal {
  if (decision.grantTier === 'pattern' && decision.pattern !== undefined) {
    return { tool: toolName, pattern: decision.pattern, agent }
  }
  return { tool: toolName, agent }
}
