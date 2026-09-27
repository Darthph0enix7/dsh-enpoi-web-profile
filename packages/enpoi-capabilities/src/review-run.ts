/**
 * enpoi-capabilities — reviewer-exec: the dedicated read-only test-run tool.
 *
 * The coding trial showed a delegated reviewer auto-denied from running tests
 * by the `never` approval policy, so "review" outcomes were structurally
 * inference-only (reads of `.pytest_cache` and mtimes). Reviewer seats cannot
 * be given the general bash surface under `never` without also giving them
 * every other command, so this capability is a deliberately narrow substitute:
 *
 * - a FIXED runner enum (no free-form shell string, no package-manager
 *   scripts — `npm test` would execute arbitrary package.json commands);
 * - an optional workspace-relative target, validated to a conservative path
 *   alphabet and quoted for the shell, never interpolated raw;
 * - execution through the confining executor under a FORCED `read-only`
 *   sandbox policy: the sandbox's writable-root allow-list is empty
 *   (`dsh-sandbox/roots`), so file mutations are denied, not merely
 *   discouraged;
 * - cwd pinned to the session workspace root, a bounded timeout, forwarded
 *   cancellation, and a scrubbed environment.
 *
 * Blast radius: arbitrary test code still executes with the harness user's
 * ambient privileges and can reach the network; only local filesystem writes
 * are denied. Nothing here is offered to non-reviewer roles: the policy engine
 * denies `review_run` outside {@link REVIEW_ROLES}, and the tool body repeats
 * the check.
 *
 * @module dsh-enpoi-capabilities/review-run
 */

import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: loads the `tools` property augmentation on Context.
import type {} from '@deepseek-ai/dsh-tools'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { reviewerSeatOf, REVIEW_RUN_TOOL, type AgentLike } from './policy'

/** Default wall-clock budget for one review run. */
export const REVIEW_RUN_DEFAULT_TIMEOUT_MS = 120_000

/** Hard cap the tool accepts for `timeoutSeconds`. */
export const REVIEW_RUN_MAX_TIMEOUT_MS = 600_000

/** One allowed runner: base argv plus whether a target argument is appended. */
interface RunnerSpec {
  /** Fixed argv prefix; the only variable tokens are the resolved interpreter and the validated target. */
  readonly argv: readonly string[]
  /** Target appended when supplied; when omitted the runtime default applies. */
  readonly target: boolean
  /** Default target appended when the caller supplies none. */
  readonly defaultTarget?: string
  /**
   * Workspace-relative interpreter candidates probed when the workspace spec
   * names none (first executable wins). A runner without candidates keeps its
   * fixed argv[0].
   */
  readonly interpreterCandidates?: readonly string[]
}

/**
 * The fixed runner table. `npx --no-install` uses the workspace's local
 * binary and never reaches the network to install one; a missing runner
 * fails with its own error the model can read. Package-manager scripts
 * (`npm test`, `pnpm test`, `make`) are deliberately absent: they execute
 * arbitrary project-defined commands.
 */
export const REVIEW_RUNNERS: Readonly<Record<string, RunnerSpec>> = Object.freeze({
  pytest: {
    argv: ['python3', '-m', 'pytest', '-q'],
    target: true,
    interpreterCandidates: ['.venv/bin/python', 'venv/bin/python'],
  },
  vitest: { argv: ['npx', '--no-install', 'vitest', 'run'], target: true },
  jest: { argv: ['npx', '--no-install', 'jest'], target: true },
  'node-test': { argv: ['node', '--test'], target: true },
  'go-test': { argv: ['go', 'test'], target: true, defaultTarget: './...' },
  'cargo-test': { argv: ['cargo', 'test', '--quiet'], target: true },
})

/** POSIX single-quote escaping for the one caller-supplied token. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Quote only when the token is not already shell-safe (absolute interpreter paths usually are). */
function shellToken(value: string): string {
  return /^[A-Za-z0-9_./@+-]+$/.test(value) ? value : shellQuote(value)
}

/** Workspace-relative path of the validated runner overlay. */
export const REVIEW_RUN_SPEC_RELATIVE_PATH = '.dsh/review-run.json'

/** One runner's validated workspace overlay: interpreter plus extra environment. */
export interface ReviewRunnerOverride {
  /** Absolute path to the executable that replaces the runner's argv[0]. */
  readonly interpreter: string
  /** Extra environment for the run (PYTHONPATH=src is the canonical use). */
  readonly env?: Readonly<Record<string, string>>
}

/** Whether a path is an executable regular file (symlinks resolved). */
function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Read and validate one workspace's `.dsh/review-run.json` overlay. Absent
 * file → no override. Malformed file → throws (misconfiguration fails loud;
 * the tool body turns it into a bounded error value). Validation: known
 * runner keys only, `interpreter` an absolute executable file, `env` a plain
 * string map with POSIX names, no `DSH_*` keys (the executor owns those and
 * would silently displace them), and no `LD_*`/`DYLD_*` loader variables
 * (the environment reaches the sandbox-runner process, so loader variables
 * would subvert confinement).
 * @param workspaceRoot - absolute workspace root the run is scoped to.
 * @param runner - the runner the overlay is requested for.
 * @returns the validated override, or undefined when the spec names none.
 */
export function readReviewRunnerOverride(workspaceRoot: string, runner: string): ReviewRunnerOverride | undefined {
  const specPath = join(workspaceRoot, REVIEW_RUN_SPEC_RELATIVE_PATH)
  let raw: string
  try {
    raw = readFileSync(specPath, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined
    throw new Error(`review-run spec ${specPath} is unreadable: ${error instanceof Error ? error.message : String(error)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`review-run spec ${specPath} is not valid JSON`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`review-run spec ${specPath} must be a JSON object of runner → { interpreter, env? }`)
  }
  const table = parsed as Record<string, unknown>
  const unknownRunners = Object.keys(table).filter(key => !Object.hasOwn(REVIEW_RUNNERS, key))
  if (unknownRunners.length > 0) {
    throw new Error(`review-run spec ${specPath} names unknown runner(s): ${unknownRunners.join(', ')}`)
  }
  const entry = table[runner]
  if (entry === undefined) return undefined
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(`review-run spec ${specPath}: ${runner} must be an object`)
  }
  const fields = entry as Record<string, unknown>
  const unknownFields = Object.keys(fields).filter(key => key !== 'interpreter' && key !== 'env')
  if (unknownFields.length > 0) {
    throw new Error(`review-run spec ${specPath}: ${runner} has unknown field(s): ${unknownFields.join(', ')}`)
  }
  const interpreter = fields['interpreter']
  if (typeof interpreter !== 'string' || !isAbsolute(interpreter)) {
    throw new Error(`review-run spec ${specPath}: ${runner}.interpreter must be an absolute path`)
  }
  if (!isExecutableFile(interpreter)) {
    throw new Error(`review-run spec ${specPath}: ${runner}.interpreter is not an executable file: ${interpreter}`)
  }
  let env: Record<string, string> | undefined
  const rawEnv = fields['env']
  if (rawEnv !== undefined) {
    if (typeof rawEnv !== 'object' || rawEnv === null || Array.isArray(rawEnv)) {
      throw new Error(`review-run spec ${specPath}: ${runner}.env must be an object of NAME → value`)
    }
    env = {}
    for (const [name, value] of Object.entries(rawEnv as Record<string, unknown>)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env has an invalid name: ${JSON.stringify(name)}`)
      }
      if (name.startsWith('DSH_')) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env may not set managed ${name}`)
      }
      // The env reaches the sandbox-runner process too, so dynamic-loader
      // variables could subvert confinement — never accept them from a
      // workspace-authored file.
      if (name.startsWith('LD_') || name.startsWith('DYLD_')) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env may not set dynamic-loader ${name}`)
      }
      if (typeof value !== 'string' || value.includes('\0')) {
        throw new Error(`review-run spec ${specPath}: ${runner}.env.${name} must be a string`)
      }
      env[name] = value
    }
  }
  return { interpreter, ...env === undefined ? {} : { env } }
}

/** Resolve the interpreter for one runner: spec override, workspace candidates, then the fixed argv[0]. */
export function resolveReviewInterpreter(workspaceRoot: string, spec: RunnerSpec, override: ReviewRunnerOverride | undefined): string {
  if (override !== undefined) return override.interpreter
  for (const candidate of spec.interpreterCandidates ?? []) {
    const path = join(workspaceRoot, candidate)
    if (isExecutableFile(path)) return path
  }
  return spec.argv[0] ?? 'sh'
}

/**
 * Validate one workspace-relative target: a conservative path alphabet, no
 * absolute path, no `..` traversal segment, and non-empty. The shell quote is
 * still applied; this is defense in depth, not the only barrier.
 * @param target - the caller's raw target.
 * @returns the accepted target.
 * @throws when the target could escape the workspace or is not a plain path.
 */
export function validateReviewTarget(target: string): string {
  const trimmed = target.trim()
  if (trimmed === '' || trimmed.startsWith('/') || trimmed.includes('\\')) {
    throw new Error('target must be a non-empty workspace-relative path')
  }
  if (!/^[A-Za-z0-9_./@+-]+$/.test(trimmed) || trimmed.split('/').includes('..')) {
    throw new Error('target may contain only letters, digits, and _.-/@+, with no `..` segment')
  }
  return trimmed
}

/**
 * Build the exact shell command for one review run: a frozen argv from
 * {@link REVIEW_RUNNERS}, the workspace-resolved interpreter in argv[0]
 * position, and at most one validated and quoted target.
 * @param runner - the runner key; must exist in {@link REVIEW_RUNNERS}.
 * @param target - optional workspace-relative target.
 * @param workspaceRoot - absolute workspace root; omitted keeps the fixed argv[0] (unit callers).
 * @param override - validated workspace overlay, when one exists.
 * @returns the command string handed to the (confined) executor.
 * @throws on an unknown runner or an invalid target.
 */
export function buildReviewRunCommand(
  runner: string,
  target: string | undefined,
  workspaceRoot?: string,
  override?: ReviewRunnerOverride,
): string {
  const spec = REVIEW_RUNNERS[runner]
  if (spec === undefined) {
    throw new Error(`unknown runner "${runner}" (available: ${Object.keys(REVIEW_RUNNERS).join(', ')})`)
  }
  const resolved = target === undefined || target.trim() === '' ? spec.defaultTarget : validateReviewTarget(target)
  const argv = [...spec.argv]
  if (workspaceRoot !== undefined) argv[0] = shellToken(resolveReviewInterpreter(workspaceRoot, spec, override))
  if (resolved !== undefined) argv.push(shellQuote(resolved))
  return argv.join(' ')
}

/** The run environment: the read-only accommodation plus the workspace overlay's env. */
export function reviewRunEnv(override: ReviewRunnerOverride | undefined): Record<string, string> {
  return { PYTHONDONTWRITEBYTECODE: '1', ...override?.env }
}

/** Clamp the caller's timeout into the accepted window. */
export function reviewRunTimeoutMs(timeoutSeconds: number | undefined): number {
  if (timeoutSeconds === undefined || !Number.isFinite(timeoutSeconds)) return REVIEW_RUN_DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.trunc(timeoutSeconds) * 1000, 1000), REVIEW_RUN_MAX_TIMEOUT_MS)
}

/** The canonical value one review run returns. */
interface ReviewRunValue {
  runner: string
  command: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  sandbox: { mode: string; denied: boolean } | null
  stdout: string
  stderr: string
  error?: string
}

/** Render the bounded run result; the `[exit code: N]` marker mirrors the bash tool. */
function renderReviewRun(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  const run = value as ReviewRunValue
  const lines: string[] = [`review_run ${run.runner}: ${run.command}`]
  if (run.error !== undefined) lines.push(run.error)
  if (run.stdout !== '') lines.push(run.stdout.trimEnd())
  if (run.stderr !== '') lines.push(`[stderr]\n${run.stderr.trimEnd()}`)
  if (run.sandbox?.denied === true) {
    lines.push(`[sandbox: file access denied under ${run.sandbox.mode} mode — the run is read-only]`)
  }
  if (run.timedOut) lines.push(`[timed out after the review-run budget]`)
  if (run.exitCode !== null && run.exitCode !== 0) lines.push(`[exit code: ${String(run.exitCode)}]`)
  else if (run.signal !== null) lines.push(`[killed by signal: ${run.signal}]`)
  return [{ type: 'text', text: lines.join('\n') }]
}

const REVIEW_RUN_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    runner: { type: 'string' },
    command: { type: 'string' },
    exitCode: { type: ['number', 'null'] },
    signal: { type: ['string', 'null'] },
    timedOut: { type: 'boolean' },
    sandbox: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        mode: { type: 'string' },
        denied: { type: 'boolean' },
      },
      required: ['mode', 'denied'],
    },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['runner', 'command', 'exitCode', 'signal', 'timedOut', 'sandbox', 'stdout', 'stderr'],
} as const

/**
 * Install `review_run` when this composition carries a confining executor.
 * An unconfined executor (or a missing sandbox policy service) registers
 * nothing: without enforcement there is no defensible read-only claim, so the
 * capability fails closed instead of running tests unsandboxed.
 * @param ctx - plugin context carrying `tools` and, once mounted, `shell`.
 */
export function installReviewRunTool(ctx: Context): void {
  ctx.inject(['shell'], () => {
    const shell = ctx.get('shell') as ShellExecutor | undefined
    const policyService = ctx.get('sandboxPolicy') as { resolve: (request?: { session?: unknown }) => SandboxExecutionPolicy } | undefined
    if (shell === undefined || shell.sandboxMode === undefined || policyService === undefined) {
      process.stderr.write('[enpoi-capabilities] review_run not registered: no confining executor/sandbox policy\n')
      return
    }
    // Register on the PLUGIN context, never the inject child scope: a layer
    // owned by the inject scope is invisible to agent scopes (it appears in no
    // request schema even though pre-execute still vetoes the name). Mirrors
    // enpoi-oracle's `ctx = root` registration.
    ctx.tools.register({
      name: REVIEW_RUN_TOOL,
      description: [
        'Run the workspace test suite READ-ONLY: a fixed runner (pytest/vitest/jest/node-test/go-test/cargo-test),',
        'an optional workspace-relative target, a timeout, and no free shell. The command executes in the',
        'workspace root under the read-only sandbox, so tests cannot write files; runner stderr may still show',
        'cache writes denied, and network access is not blocked. A workspace `.dsh/review-run.json` may pin the',
        'runner interpreter (absolute executable path) and extra env (e.g. PYTHONPATH=src). Available to',
        'reviewer/oracle seats only.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          runner: {
            type: 'string',
            enum: Object.keys(REVIEW_RUNNERS),
            description: 'The fixed test runner to invoke.',
          },
          target: {
            type: 'string',
            description: 'Optional workspace-relative path or filter passed to the runner (no absolute paths, no `..`).',
          },
          timeoutSeconds: {
            type: 'number',
            description: `Wall-clock budget in seconds (default ${String(REVIEW_RUN_DEFAULT_TIMEOUT_MS / 1000)}, max ${String(REVIEW_RUN_MAX_TIMEOUT_MS / 1000)}).`,
          },
        },
        required: ['runner'],
      },
      output: { schema: REVIEW_RUN_OUTPUT_SCHEMA as never, render: renderReviewRun },
      isConcurrencySafe: () => true,
      async execute(args: unknown, exec): Promise<unknown> {
        const request = (args ?? {}) as { runner?: unknown; target?: unknown; timeoutSeconds?: unknown }
        const runner = typeof request.runner === 'string' ? request.runner : ''
        const value: ReviewRunValue = {
          runner,
          command: '',
          exitCode: null,
          signal: null,
          timedOut: false,
          sandbox: { mode: 'read-only', denied: false },
          stdout: '',
          stderr: '',
        }
        try {
          // The seat check uses the descriptor-aware resolver: a delegated
          // reviewer child carries the parent's preset, so the role id alone
          // cannot authorize it.
          if (!reviewerSeatOf(exec.agent as AgentLike | undefined)) {
            throw new Error('review_run is available only to reviewer/oracle seats')
          }
          const timeoutMs = reviewRunTimeoutMs(
            typeof request.timeoutSeconds === 'number' ? request.timeoutSeconds : undefined,
          )
          const standing = policyService.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
          const override = readReviewRunnerOverride(standing.workspaceRoot, runner)
          value.command = buildReviewRunCommand(
            runner,
            typeof request.target === 'string' ? request.target : undefined,
            standing.workspaceRoot,
            override,
          )
          const sandboxPolicy: SandboxExecutionPolicy = { ...standing, mode: 'read-only' }
          const execution = await shell.execute(shell.resolve({
            command: value.command,
            workdir: standing.workspaceRoot,
            timeoutMs,
            signal: exec.signal,
            env: reviewRunEnv(override),
            sandboxPolicy,
          }))
          const result = await execution.result()
          value.exitCode = result.exitCode
          value.signal = result.signal
          value.timedOut = result.timedOut
          value.stdout = result.stdout.text
          value.stderr = result.stderr.text
          value.sandbox = { mode: result.sandbox?.mode ?? 'read-only', denied: result.sandbox?.denied ?? false }
          return value
        } catch (error) {
          value.error = `review_run could not execute: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
          return value
        }
      },
    })
  })
}
