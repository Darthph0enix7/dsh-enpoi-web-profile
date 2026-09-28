/**
 * enpoi-capabilities — Forwarded child approvals (doc 82 §E7; doc 55 extension).
 *
 * A delegated child runs with its approval policy pinned to `never`
 * (`@deepseek-ai/dsh-subagent` `captureDelegatedPolicyOverrides`), so an
 * approval-required action is rejected before any card can appear and
 * dangerous-but-legitimate work dead-ends. This module resolves such an ask
 * through the parent instead of the child.
 *
 * Resolution order for one child ask:
 *   1. RAILS FIRST. Explicit deny rules, workspace-boundary escapes the parent
 *      itself does not allow, credential paths (`.env`, `.ssh`, keys, …) and the
 *      dangerous classes (recursive deletes, force-push/history rewrite,
 *      exfiltration, `curl | sh`, privilege escalation) plus recursion past the
 *      delegation depth cap are NEVER card-approvable. Each resolves only through
 *      the parent's own effective policy: an `allow` there passes, anything else
 *      denies with the rail named. The child asking nicely can never lift them.
 *   2. Subtree grants answered earlier on a forwarded card (this session only).
 *   3. MODE-AWARE STANDING CONSENT — Adam's rule, a DELIBERATE deviation from the
 *      field's unified "only a human answers a child's ask":
 *      when the ROOT session runs in Full access / no-restrictions mode
 *      (sandbox `danger-full-access` + approval `never`), the operator has
 *      already pre-approved the session's whole risk envelope. The parent's mode
 *      IS the standing answer: the ask resolves `allowed-once` with no human card.
 *      The field's rule exists so no AGENT can answer for the human; an
 *      operator-selected mode is the human's own pre-answer, not an agent reply.
 *      In EVERY other mode the human card appears (interactive) or the ask fails
 *      closed (unattended approval `never` without full access).
 *   4. Interactive: the ask is forwarded into the ROOT session as the existing
 *      approval card (`ctx.approval.request` on the root agent), carrying
 *      provenance (origin session, agent label, depth, matched rule) plus a short
 *      derived recommendation in the reason. The reply routes back by request id
 *      and the waiting child suspends on it; no agent may answer (this module has
 *      no model channel by construction).
 *
 * Failure semantics: a rejection is a corrective tool error the child adapts to,
 * never its death. An unanswered/undeliverable ask fails closed with a quiet
 * notification (stderr) and lets the child's turn settle — no hang, no waking the
 * root mid-turn.
 *
 * Grant scoping: an "always allow" answered on a forwarded card is stored in
 * memory against the REQUESTER'S OWN session for this process only; a sibling,
 * another root, or another process does not inherit it, and it never overrides a
 * deny because denies terminate in {@link resolvePolicy} before this module runs.
 * A broad allow is asked a SECOND time before it is stored. A child can never
 * self-escalate: this module only maps an ask the child's own policy produced.
 *
 * Finality: an ask resolved `allow` is recorded against the requester's own
 * session and call identity ({@link ChildApprovalForwarder.resolvesFinalCall})
 * and served to the host as the `forwardedApprovals` service. The core tool
 * registry's ask path consumes that record, so a later outer ask or a reviewer
 * denial cannot re-open a call the human (or the root's Full-access mode)
 * already allowed.
 */

import { isAbsolute, relative, resolve as resolvePath } from 'node:path'
import {
  grantProposalFor,
  grantProposalForOutcome,
  splitCompoundCommand,
  stripEnvPrefixes,
  type GrantProposal,
  type PolicyDecision,
} from './policy'

/** The closed approval vocabulary the card can return. */
export type ApprovalOutcome =
  | 'allowed-once'
  | 'allowed-always'
  | 'allowed-always-broad'
  | 'rejected'
  | 'cancelled'
  | 'unavailable'

/** The ask arm of a policy decision this module forwards. */
export type AskDecision = Extract<PolicyDecision, { kind: 'ask' }>

/** The root session's effective operating mode for a forwarded ask. */
export type RootMode = 'full-access' | 'interactive' | 'unattended'

/** Provenance carried on every forwarded ask (card, audit, and grant scope). */
export interface ForwardingOrigin {
  /** Session that produced the ask (the delegated child). */
  readonly childSessionId: string
  /** Session the card is rendered in (the nearest live root). */
  readonly rootSessionId: string
  /** The child's direct parent session id. */
  readonly parentSessionId: string
  /** Delegation depth from the root (1 = direct child). */
  readonly depth: number
  /** Human-readable agent label from the child's subagent descriptor. */
  readonly label: string
  /** The child session's workspace root, for the recommendation/boundary rail. */
  readonly cwd?: string
}

/** Dangerous classes that are never card-approvable for a child. */
export type RailClass =
  | 'depth'
  | 'privilege-escalation'
  | 'recursive-delete'
  | 'history-rewrite'
  | 'exfiltration'
  | 'pipe-to-shell'
  | 'credentials'
  | 'boundary'

/** One rail match: the class and the exact evidence it matched. */
export interface RailHit {
  readonly rail: RailClass
  readonly evidence: string
}

/** The structural child-agent slice this module reads (never the live Agent type). */
export interface ChildAgentLike {
  readonly session?: {
    readonly header?: {
      readonly id?: unknown
      readonly parentSession?: unknown
      readonly cwd?: unknown
      readonly delegationDepth?: unknown
      readonly origin?: unknown
    }
    readonly ownEvents?: () => readonly {
      readonly type?: string
      readonly data?: { readonly label?: unknown; readonly persona?: unknown }
    }[]
  }
}

/** The live root agent handed back to the host for `approval.request`. */
export interface RootHandle {
  readonly id: string
  /** The exact live Agent the host passes to `ApprovalService.request`. */
  readonly agent: unknown
}

/** One card dispatch on the root agent. */
export interface RootAskQuery {
  readonly root: RootHandle
  readonly toolName: string
  readonly reason: string
  readonly displayReason: { readonly en: string; readonly [locale: string]: string }
  readonly broadAllow?: { readonly label: string }
  /** True for the second card that confirms a broad standing grant. */
  readonly secondConfirmation?: boolean
  readonly signal?: AbortSignal
  readonly origin: ForwardingOrigin
}

/** One rail-ceiling query: "would the parent's own policy allow this action?". */
export interface ParentRailQuery {
  readonly root: RootHandle
  readonly toolName: string
  readonly command?: string
  readonly rail: RailClass
}

/** Host seams the forwarder consumes; every one is owned by index.ts. */
export interface ForwardingDeps {
  /** Nearest live root ancestor of a child session, or undefined when none is live. */
  findRoot(childSessionId: string): RootHandle | undefined
  /** The root session's effective mode; undefined when its log is unreadable. */
  modeOf(root: RootHandle): RootMode | undefined
  /** Whether the parent's own effective policy allows a rail class outright. */
  parentAllowsRail(query: ParentRailQuery): boolean
  /** Dispatch one approval card on the root agent and await its outcome. */
  askRoot(query: RootAskQuery): Promise<ApprovalOutcome>
  /** Quiet audit/notification line; never wakes the root. */
  report(line: string): void
  /** The deployment's delegation depth cap (`ctx.subagents.resolveMaxDepth`). */
  depthCap(): number
}

/** One delegated child ask entering the forwarder. */
export interface ChildAskInput {
  readonly agent: ChildAgentLike | undefined
  readonly toolName: string
  readonly args?: Record<string, unknown>
  readonly decision: AskDecision
  /** The child's call identity; an allowed ask is recorded against it as final. */
  readonly callId?: string | number | undefined
  readonly signal?: AbortSignal
}

/** The tool-level decision the pre-execute listener returns. */
export type ChildAskResolution =
  | { readonly kind: 'allow'; readonly reason: string }
  | { readonly kind: 'deny'; readonly reason: string }

/**
 * Marker embedded in every forwarded ask reason. The allow-always grant writer
 * recognises it and skips its global persistence path: a forwarded grant is
 * scoped to the requester's session and written by the forwarder itself.
 */
export const FORWARDED_ASK_MARKER = '[forwarded child ask]'

/** Path-argument keys scanned for credential and boundary rails. */
const PATH_ARG_KEYS: readonly string[] = [
  'file_path', 'filePath', 'path', 'paths', 'target', 'destination', 'source', 'file', 'dir', 'directory',
]

/** Credential-bearing paths that are never card-approvable for a child. */
const CREDENTIAL_PATH = /(?:^|[\s/'"=@])\.env(?:\.|$|\s)|(?:^|[\s/'"=])\.ssh(?:\/|[\s'"]|$)|id_(?:rsa|ed25519|ecdsa)\b|\.pem\b|(?:^|[\s/'"=])\.netrc\b|(?:^|[\s/'"=])\.aws(?:\/|[\s'"]|$)|(?:^|[\s/'"=])\.git-credentials\b|(?:^|[\s/'"=])known_hosts\b|(?:^|[\s/'"=])credentials(?:\.json)?(?:\s|$)|\/\.config\/gcloud\/|\/\.kube\/config\b|\/\.docker\/config\.json\b|\/\.npmrc\b/i

/** Commands that escalate privilege outright. */
const PRIVILEGE_ESCALATORS: ReadonlySet<string> = new Set(['sudo', 'su', 'doas', 'pkexec'])

/** Commands whose primary purpose is moving bytes off the machine. */
const EXFILTRATORS: ReadonlySet<string> = new Set(['scp', 'sftp', 'ftp', 'lftp', 'nc', 'ncat', 'socat', 'telnet', 'sshpass'])

/** Interpreters that turn a pipe or process substitution into code execution. */
const PIPE_INTERPRETER = /^(?:python[0-9.]*|perl|ruby|node|deno|bun|php)$/

/** Read-only filesystem capability that still touches a path argument. */
const FS_PATH_TOOLS: ReadonlySet<string> = new Set([
  'read', 'read_image', 'read_image_file', 'write', 'edit', 'str_replace_editor', 'list_dir', 'delete', 'move', 'copy',
])

/** Truncated session id used in human-facing provenance text. */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

/**
 * Read the delegated-child provenance of one live agent, or undefined when the
 * agent is not a delegated child (no persisted parent session). The label is the
 * newest `subagent/descriptor` the spawning tool authored; reviewer tools label
 * their children by convention, so this is the honest agent identity.
 * @param agent - the live asking agent, structurally narrow.
 * @returns the child session id, parent session id, depth, label, and cwd.
 */
export function delegatedChildOf(agent: ChildAgentLike | undefined): {
  childSessionId: string
  parentSessionId: string
  depth: number
  label: string
  cwd?: string
} | undefined {
  const header = agent?.session?.header
  const childSessionId = typeof header?.id === 'string' && header.id !== '' ? header.id : undefined
  const parentSessionId = typeof header?.parentSession === 'string' && header.parentSession !== '' ? header.parentSession : undefined
  if (childSessionId === undefined || parentSessionId === undefined) return undefined
  const rawDepth = header?.delegationDepth
  const depth = typeof rawDepth === 'number' && Number.isSafeInteger(rawDepth) && rawDepth > 0 ? rawDepth : 1
  let label: string | undefined
  for (const event of agent?.session?.ownEvents?.() ?? []) {
    if (event?.type !== 'subagent/descriptor') continue
    if (typeof event.data?.label === 'string' && event.data.label.trim() !== '') label = event.data.label.trim()
    break
  }
  const cwd = typeof header?.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined
  return {
    childSessionId,
    parentSessionId,
    depth,
    label: label ?? `child ${shortId(childSessionId)}`,
    ...cwd !== undefined ? { cwd } : {},
  }
}

/** Collect every declared path argument of one tool call. */
function pathArguments(args: Record<string, unknown> | undefined): string[] {
  if (args === undefined) return []
  const found: string[] = []
  for (const key of PATH_ARG_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') found.push(value)
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item !== '') found.push(item)
    }
  }
  return found
}

/** Whether a path argument resolves outside the child's workspace root. */
function isOutsideWorkspace(path: string, cwd: string | undefined): boolean {
  if (cwd === undefined || cwd === '') return false
  const absolute = isAbsolute(path) ? path : resolvePath(cwd, path)
  const rel = relative(cwd, absolute)
  return rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)
}

/** Whether one `rm`/`rmdir` invocation is recursive or forced. */
function isRecursiveDelete(argv: readonly string[]): boolean {
  const argv0 = argv[0]
  if (argv0 === 'rmdir') return true
  return argv.slice(1).some((token) => {
    if (token === '--') return false
    if (token.startsWith('--')) return token === '--recursive' || token === '--force'
    return token.startsWith('-') && /[rRf]/.test(token.slice(1))
  })
}

/** Whether one `git` sub-command rewrites history or force-pushes. */
function isHistoryRewrite(argv: readonly string[]): boolean {
  const sub = argv[1]
  if (sub === 'push') {
    return argv.slice(2).some(token => token === '-f' || token === '--force' || token === '--force-with-lease'
      || token === '--force-if-includes' || token === '--mirror' || token === '--delete'
      || token.startsWith('--force-with-lease='))
  }
  if (sub === 'reset') return argv.includes('--hard')
  return sub === 'filter-branch' || sub === 'filter-repo'
}

/** Whether a token names a remote rsync/scp target (`host:path`, `user@host:path`). */
function isRemoteTarget(token: string): boolean {
  if (token.includes('://') || token.startsWith('/') || token.startsWith('-')) return false
  return /^[^/][^:]*:.+/.test(token)
}

/** Whether a piped/process-substituted interpreter can run arbitrary code. */
function isPipeToShell(command: string): boolean {
  if (/\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh(?:\s|$)/.test(command)) return true
  if (/\|\s*(?:python[0-9.]*|perl|ruby|node|deno|bun|php)(?:\s|$)/.test(command)) return true
  return /(?:ba|z|da|k)?sh\s+<\(|(?:python[0-9.]*|node)\s+<\(/.test(command)
}

/** Classify one bash command against the never-card-approvable classes. */
function railOfBash(command: string): RailHit | undefined {
  if (isPipeToShell(command)) return { rail: 'pipe-to-shell', evidence: command.trim() }
  const credential = CREDENTIAL_PATH.exec(command)
  if (credential !== null) return { rail: 'credentials', evidence: credential[0] }
  for (const rawSub of splitCompoundCommand(command)) {
    const sub = stripEnvPrefixes(rawSub).trim()
    if (sub === '') continue
    const argv = sub.split(/\s+/)
    const argv0 = argv[0] ?? ''
    if (PRIVILEGE_ESCALATORS.has(argv0)) return { rail: 'privilege-escalation', evidence: sub }
    if ((argv0 === 'rm' || argv0 === 'rmdir') && isRecursiveDelete(argv)) return { rail: 'recursive-delete', evidence: sub }
    if (argv0 === 'find' && /(?:^|\s)(?:-delete|-exec\s+rm\b)/.test(sub)) return { rail: 'recursive-delete', evidence: sub }
    if (argv0 === 'rsync' && /(?:^|\s)--delete\b/.test(sub)) return { rail: 'recursive-delete', evidence: sub }
    if (argv0 === 'git' && isHistoryRewrite(argv)) return { rail: 'history-rewrite', evidence: sub }
    if (EXFILTRATORS.has(argv0)) return { rail: 'exfiltration', evidence: sub }
    if (argv0 === 'rsync' && argv.slice(1).some(isRemoteTarget)) return { rail: 'exfiltration', evidence: sub }
    if (argv0 === 'curl' && argv.slice(1).some((token: string) => token === '-T' || token === '--upload-file' || token.startsWith('--upload-file='))) {
      return { rail: 'exfiltration', evidence: sub }
    }
    if (argv0 === 'wget' && argv.slice(1).some((token: string) => token === '--post-file' || token === '--body-file')) {
      return { rail: 'exfiltration', evidence: sub }
    }
    if ((argv0 === 'docker' || argv0 === 'podman') && argv[1] === 'push') return { rail: 'exfiltration', evidence: sub }
  }
  return undefined
}

/**
 * Classify one child tool call against the rails. Bash commands are classified
 * by class (privilege escalation, recursive delete, history rewrite, exfil,
 * pipe-to-shell, credentials); filesystem tools by their declared path
 * arguments (credentials, workspace boundary). Returns the first hit.
 * @param input - tool name, call arguments, and the child's workspace root.
 * @returns the matched rail and its evidence, or undefined when none apply.
 */
export function railHitOf(input: {
  toolName: string
  args?: Record<string, unknown> | undefined
  cwd?: string | undefined
}): RailHit | undefined {
  if (input.toolName === 'bash') {
    const command = typeof input.args?.command === 'string' ? input.args.command : undefined
    return command === undefined || command.trim() === '' ? undefined : railOfBash(command)
  }
  if (!FS_PATH_TOOLS.has(input.toolName)) return undefined
  for (const path of pathArguments(input.args)) {
    if (CREDENTIAL_PATH.test(path)) return { rail: 'credentials', evidence: path }
    if (isOutsideWorkspace(path, input.cwd)) return { rail: 'boundary', evidence: path }
  }
  return undefined
}

/**
 * The short recommendation line the card carries, derived by the forwarder from
 * the parent's policy facts — never from an agent model (no agent's words can
 * influence a child's approval). Boundary escapes never reach here (the rail
 * handles them), so a named path is inside the workspace.
 * @param input - tool name, call arguments, and the child's workspace root.
 * @returns a short recommendation sentence.
 */
export function recommendationOf(input: {
  toolName: string
  args?: Record<string, unknown> | undefined
  cwd?: string | undefined
}): string {
  const paths = input.toolName === 'bash' ? [] : pathArguments(input.args)
  if (paths.length === 0) return 'no filesystem path named'
  return 'inside the workspace, looks safe'
}

/** The audited reason one forwarded ask carries (full provenance). */
export function forwardedAskReason(origin: ForwardingOrigin, decision: AskDecision, recommendation: string): string {
  return `${FORWARDED_ASK_MARKER} ${decision.reason}. Origin session ${shortId(origin.childSessionId)}, `
    + `agent ${origin.label}, depth ${origin.depth}, matched rule ${decision.source}. `
    + `Parent recommendation: ${recommendation}.`
}

/** The card's localized headline, keeping provenance short. */
export function forwardedAskDisplayReason(
  origin: ForwardingOrigin,
  decision: AskDecision,
  recommendation: string,
): { readonly en: string; readonly zh: string } {
  return {
    en: `Forwarded from ${origin.label} (depth ${origin.depth}): ${decision.reason}. ${recommendation}.`,
    zh: `来自 ${origin.label} 的转发请求（深度 ${origin.depth}）：${decision.reason}。${recommendation}。`,
  }
}

/** One in-memory grant record, scoped to the requester's own session. */
interface SubtreeGrant {
  readonly proposal: GrantProposal
  readonly admittedAt: number
}

/**
 * Forwarder for delegated-child asks. One instance per plugin application;
 * every host seam arrives through {@link ForwardingDeps} so the decision rules
 * are exercised without a live harness.
 */
export class ChildApprovalForwarder {
  private readonly grants = new Map<string, SubtreeGrant[]>()
  private readonly pending = new Map<string, Promise<ChildAskResolution>>()
  /** Calls an allow resolution made final: child session id → call id → tool name. */
  private readonly allowedCalls = new Map<string, Map<string, string>>()

  constructor(private readonly deps: ForwardingDeps) {}

  /**
   * Resolve one child ask through the parent. Rails run first and are never
   * card-approvable; then an existing subtree grant; then the root's mode
   * (standing consent / card / fail closed). A rejection is returned as a
   * corrective deny; nothing here kills the child. An allow is final for the
   * exact call identity: {@link resolvesFinalCall} reports it so no later ask
   * or reviewer denial can re-open what the human (or the root's Full-access
   * mode) already allowed, and a call already on record resolves allow here
   * without another card.
   * @param input - the child agent, tool call, and the ask the child's policy produced.
   * @returns the allow/deny resolution for the pre-execute listener.
   */
  async forward(input: ChildAskInput): Promise<ChildAskResolution> {
    if (input.callId !== undefined) {
      const child = delegatedChildOf(input.agent)
      if (child !== undefined && this.resolvesFinalCall(child.childSessionId, String(input.callId), input.toolName)) {
        return { kind: 'allow', reason: 'this call was already allowed by a forwarded ask' }
      }
    }
    const resolution = await this.resolveAsk(input)
    if (resolution.kind === 'allow' && input.callId !== undefined) {
      const child = delegatedChildOf(input.agent)
      if (child !== undefined) {
        const calls = this.allowedCalls.get(child.childSessionId) ?? new Map<string, string>()
        calls.set(String(input.callId), input.toolName)
        this.allowedCalls.set(child.childSessionId, calls)
      }
    }
    return resolution
  }

  /**
   * Whether one exact call from one child session was already allowed by a
   * forwarded ask. The record is scoped to the requesting child session and
   * pins the tool name, so a sibling session or another tool reusing the call
   * id never matches.
   * @param childSessionId - the requesting child session.
   * @param callId - the call identity the forwarded ask was recorded under.
   * @param toolName - the tool the recorded ask resolved for.
   * @returns `true` when the call is already allowed and final.
   */
  resolvesFinalCall(childSessionId: string, callId: string, toolName: string): boolean {
    return this.allowedCalls.get(childSessionId)?.get(callId) === toolName
  }

  /** Resolve one child ask through the parent; see {@link forward}. */
  private async resolveAsk(input: ChildAskInput): Promise<ChildAskResolution> {
    const child = delegatedChildOf(input.agent)
    if (child === undefined) {
      this.deps.report(`deny: non-child ask for ${input.toolName} reached the child forwarder`)
      return { kind: 'deny', reason: `child approval forwarding received a non-child ask for ${input.toolName}` }
    }
    const root = this.deps.findRoot(child.childSessionId)
    if (root === undefined) {
      return this.failClosed(child.childSessionId, input.toolName, 'no live parent session to forward to')
    }
    const origin: ForwardingOrigin = { ...child, rootSessionId: root.id }

    const depthCap = this.deps.depthCap()
    if (child.depth > depthCap) {
      this.deps.report(`deny: ${input.toolName} from child ${shortId(child.childSessionId)} at depth ${child.depth} exceeds cap ${depthCap}`)
      return {
        kind: 'deny',
        reason: `approval for ${input.toolName} was denied: delegation depth ${child.depth} is past the cap ${depthCap}, `
          + 'so this ask is never forwarded to a human card',
      }
    }

    const command = input.toolName === 'bash' && typeof input.args?.command === 'string' ? input.args.command : undefined
    const rail = railHitOf({ toolName: input.toolName, args: input.args, cwd: child.cwd })
    if (rail !== undefined) {
      const allowed = this.deps.parentAllowsRail({ root, toolName: input.toolName, ...command !== undefined ? { command } : {}, rail: rail.rail })
      this.deps.report(
        `${allowed ? 'allow' : 'deny'}: rail ${rail.rail} (${rail.evidence}) from child ${shortId(child.childSessionId)} `
        + `resolved through the parent's own policy`,
      )
      if (allowed) return { kind: 'allow', reason: `rail ${rail.rail}: the parent's own policy allows this action` }
      return {
        kind: 'deny',
        reason: `approval for ${input.toolName} was denied: ${rail.rail} (${rail.evidence}) is never approvable from a `
          + "forwarded child card and the parent's own policy does not allow it",
      }
    }

    const proposal = grantProposalFor(input.decision, input.toolName, command, child.label)
    if (this.grantAllows(child.childSessionId, input.decision, proposal)) {
      this.deps.report(`allow: ${input.toolName} absorbed by a grant scoped to child session ${shortId(child.childSessionId)}`)
      return { kind: 'allow', reason: 'allowed by a standing grant scoped to this child session' }
    }

    const mode = this.deps.modeOf(root)
    if (mode === 'full-access') {
      // MODE-AWARE STANDING CONSENT (Adam's rule): the operator picked Full
      // access / no restrictions for the root session — the pre-approval of the
      // session's risk envelope. Resolve the ask inside that policy, with no card.
      this.deps.report(
        `allow: standing consent (root ${shortId(root.id)} is Full access / no restrictions) for ${input.toolName} `
        + `from child ${shortId(child.childSessionId)}`,
      )
      return { kind: 'allow', reason: "approved by the parent session's Full access standing consent" }
    }
    if (mode !== 'interactive') {
      return this.failClosed(
        child.childSessionId,
        input.toolName,
        mode === undefined ? 'parent session mode is unknown' : 'parent runs unattended with approval prompts disabled',
      )
    }

    const recommendation = recommendationOf({ toolName: input.toolName, args: input.args, cwd: child.cwd })
    const batchKey = `${child.childSessionId}\u0000${input.toolName}\u0000${command ?? stableJson(input.args)}`
    const inFlight = this.pending.get(batchKey)
    if (inFlight !== undefined) return await inFlight
    const run = this.askThroughCard(input, root, origin, proposal, recommendation)
    this.pending.set(batchKey, run)
    try {
      return await run
    } finally {
      this.pending.delete(batchKey)
    }
  }

  /** Forward the ask as one root-session card and map its outcome. */
  private async askThroughCard(
    input: ChildAskInput,
    root: RootHandle,
    origin: ForwardingOrigin,
    proposal: GrantProposal,
    recommendation: string,
  ): Promise<ChildAskResolution> {
    const reason = forwardedAskReason(origin, input.decision, recommendation)
    let outcome: ApprovalOutcome
    try {
      outcome = await this.deps.askRoot({
        root,
        toolName: input.toolName,
        reason,
        displayReason: forwardedAskDisplayReason(origin, input.decision, recommendation),
        ...input.decision.broadAllow !== undefined ? { broadAllow: input.decision.broadAllow } : {},
        ...input.signal !== undefined ? { signal: input.signal } : {},
        origin,
      })
    } catch (error) {
      return this.failClosed(
        origin.childSessionId,
        input.toolName,
        `the forwarded ask could not be delivered: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    switch (outcome) {
      case 'allowed-once':
        this.deps.report(`allow: human approved ${input.toolName} once for child ${shortId(origin.childSessionId)}`)
        return { kind: 'allow', reason: 'approved once on the forwarded parent card' }
      case 'allowed-always':
        this.recordGrant(origin.childSessionId, proposal)
        this.deps.report(`allow: exact-command always granted to child session ${shortId(origin.childSessionId)}`)
        return { kind: 'allow', reason: 'approved with a standing grant scoped to this child session' }
      case 'allowed-always-broad': {
        let confirm: ApprovalOutcome
        try {
          confirm = await this.deps.askRoot({
            root,
            toolName: input.toolName,
            reason: `${FORWARDED_ASK_MARKER} second confirmation: grant "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}" as a `
              + `standing allowance for child ${shortId(origin.childSessionId)} (${origin.label}, depth ${origin.depth})?`,
            displayReason: {
              en: `Confirm a broad standing grant to ${origin.label} (depth ${origin.depth}) for "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}".`,
              zh: `请再次确认向 ${origin.label}（深度 ${origin.depth}）授予 "${proposal.broadPattern ?? proposal.pattern ?? input.toolName}" 的长期许可。`,
            },
            secondConfirmation: true,
            ...input.signal !== undefined ? { signal: input.signal } : {},
            origin,
          })
        } catch (error) {
          return this.failClosed(
            origin.childSessionId,
            input.toolName,
            `the broad-grant confirmation could not be delivered: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        if (confirm === 'allowed-once' || confirm === 'allowed-always' || confirm === 'allowed-always-broad') {
          this.recordGrant(origin.childSessionId, grantProposalForOutcome(proposal, true))
          this.deps.report(`allow: broad grant confirmed for child session ${shortId(origin.childSessionId)}`)
          return { kind: 'allow', reason: 'approved with a confirmed broad grant scoped to this child session' }
        }
        return {
          kind: 'deny',
          reason: `the broad standing grant for ${input.toolName} was not confirmed`,
        }
      }
      case 'rejected':
        this.deps.report(`deny: human rejected ${input.toolName} for child ${shortId(origin.childSessionId)}`)
        return {
          kind: 'deny',
          reason: `the user rejected ${input.toolName}; it required approval because: ${input.decision.reason}`,
        }
      case 'cancelled':
        return { kind: 'deny', reason: `approval for ${input.toolName} was cancelled before it was answered` }
      case 'unavailable':
        return this.failClosed(origin.childSessionId, input.toolName, 'the forwarded ask was left unanswered')
      default:
        return this.failClosed(origin.childSessionId, input.toolName, `unexpected approval outcome ${String(outcome)}`)
    }
  }

  /** Fail closed with a quiet notification; the child's turn settles normally. */
  private failClosed(childSessionId: string, toolName: string, why: string): ChildAskResolution {
    this.deps.report(`fail-closed: ${toolName} from child ${shortId(childSessionId)}: ${why}`)
    return {
      kind: 'deny',
      reason: `approval for ${toolName} failed closed: ${why}. Adapt the task or report the limitation instead of retrying.`,
    }
  }

  /** Whether an earlier forwarded "always" covers this ask for this child session. */
  private grantAllows(childSessionId: string, decision: AskDecision, proposal: GrantProposal): boolean {
    const grants = this.grants.get(childSessionId)
    if (grants === undefined) return false
    for (const grant of grants) {
      if (grant.proposal.tool !== proposal.tool) continue
      if (grant.proposal.pattern === proposal.pattern) return true
      if (grant.proposal.pattern !== undefined && grant.proposal.pattern === decision.pattern) return true
    }
    return false
  }

  /** Record one grant against the requester's own session (deduplicated). */
  private recordGrant(childSessionId: string, proposal: GrantProposal): void {
    const grants = this.grants.get(childSessionId) ?? []
    if (!grants.some(grant => grant.proposal.tool === proposal.tool && grant.proposal.pattern === proposal.pattern)) {
      grants.push({ proposal, admittedAt: Date.now() })
      this.grants.set(childSessionId, grants)
    }
  }
}

/** The session id inside the structural session slice a host passes to the seam. */
function sessionIdOf(session: unknown): string | undefined {
  const header = (session as { header?: { id?: unknown } } | undefined)?.header
  return typeof header?.id === 'string' && header.id !== '' ? header.id : undefined
}

/**
 * The `forwardedApprovals` host service one forwarder provides. It answers
 * whether one exact call was already allowed by a forwarded child ask, keyed by
 * the requesting session and call identity. The core tool registry consumes it
 * with `ctx.get('forwardedApprovals')` so an outer ask or a reviewer denial
 * cannot re-open a call the human (or the root's Full-access mode) already
 * allowed.
 * @param forwarder - the live forwarder whose records answer the query.
 * @returns the resolves-only service facade.
 */
export function forwardedApprovalsSeam(forwarder: ChildApprovalForwarder): {
  resolves(session: unknown, callId: unknown, toolName: unknown): boolean
} {
  return {
    resolves: (session, callId, toolName) => {
      const childSessionId = sessionIdOf(session)
      return childSessionId !== undefined && typeof callId === 'string' && typeof toolName === 'string'
        && forwarder.resolvesFinalCall(childSessionId, callId, toolName)
    },
  }
}

/** Stable JSON for the batch key; arguments are already logged, lossless JSON. */
function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return '<unserializable>'
  }
}
