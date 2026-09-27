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

import type { Context } from '@deepseek-ai/cordis'
// Type-only: loads the `tools` property augmentation on Context.
import type {} from '@deepseek-ai/dsh-tools'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import { agentRoleOf, REVIEW_ROLES, REVIEW_RUN_TOOL, type AgentLike } from './policy'

/** Default wall-clock budget for one review run. */
export const REVIEW_RUN_DEFAULT_TIMEOUT_MS = 120_000

/** Hard cap the tool accepts for `timeoutSeconds`. */
export const REVIEW_RUN_MAX_TIMEOUT_MS = 600_000

/** One allowed runner: base argv plus whether a target argument is appended. */
interface RunnerSpec {
  /** Fixed argv prefix; the only variable token is the validated target. */
  readonly argv: readonly string[]
  /** Target appended when supplied; when omitted the runtime default applies. */
  readonly target: boolean
  /** Default target appended when the caller supplies none. */
  readonly defaultTarget?: string
}

/**
 * The fixed runner table. `npx --no-install` uses the workspace's local
 * binary and never reaches the network to install one; a missing runner
 * fails with its own error the model can read. Package-manager scripts
 * (`npm test`, `pnpm test`, `make`) are deliberately absent: they execute
 * arbitrary project-defined commands.
 */
export const REVIEW_RUNNERS: Readonly<Record<string, RunnerSpec>> = Object.freeze({
  pytest: { argv: ['python3', '-m', 'pytest', '-q'], target: true },
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
 * {@link REVIEW_RUNNERS} plus, at most, one validated and quoted target.
 * @param runner - the runner key; must exist in {@link REVIEW_RUNNERS}.
 * @param target - optional workspace-relative target.
 * @returns the command string handed to the (confined) executor.
 * @throws on an unknown runner or an invalid target.
 */
export function buildReviewRunCommand(runner: string, target: string | undefined): string {
  const spec = REVIEW_RUNNERS[runner]
  if (spec === undefined) {
    throw new Error(`unknown runner "${runner}" (available: ${Object.keys(REVIEW_RUNNERS).join(', ')})`)
  }
  const resolved = target === undefined || target.trim() === '' ? spec.defaultTarget : validateReviewTarget(target)
  const argv = resolved === undefined ? spec.argv : [...spec.argv, shellQuote(resolved)]
  return argv.join(' ')
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
  ctx.inject(['shell'], (scope) => {
    const shell = scope.get('shell') as ShellExecutor | undefined
    const policyService = scope.get('sandboxPolicy') as { resolve: (request?: { session?: unknown }) => SandboxExecutionPolicy } | undefined
    if (shell === undefined || shell.sandboxMode === undefined || policyService === undefined) {
      process.stderr.write('[enpoi-capabilities] review_run not registered: no confining executor/sandbox policy\n')
      return
    }
    scope.tools.register({
      name: REVIEW_RUN_TOOL,
      description: [
        'Run the workspace test suite READ-ONLY: a fixed runner (pytest/vitest/jest/node-test/go-test/cargo-test),',
        'an optional workspace-relative target, a timeout, and no free shell. The command executes in the',
        'workspace root under the read-only sandbox, so tests cannot write files; runner stderr may still show',
        'cache writes denied, and network access is not blocked. Available to reviewer/oracle seats only.',
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
        const role = agentRoleOf(exec.agent as AgentLike | undefined)
        if (role === undefined || !REVIEW_ROLES.has(role)) {
          throw new Error(`review_run is available only to reviewer/oracle seats (role ${role ?? 'unknown'})`)
        }
        const command = buildReviewRunCommand(
          runner,
          typeof request.target === 'string' ? request.target : undefined,
        )
        const timeoutMs = reviewRunTimeoutMs(
          typeof request.timeoutSeconds === 'number' ? request.timeoutSeconds : undefined,
        )
        const standing = policyService.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
        const sandboxPolicy: SandboxExecutionPolicy = { ...standing, mode: 'read-only' }
        const value: ReviewRunValue = {
          runner,
          command,
          exitCode: null,
          signal: null,
          timedOut: false,
          sandbox: { mode: 'read-only', denied: false },
          stdout: '',
          stderr: '',
        }
        try {
          const execution = await shell.execute(shell.resolve({
            command,
            workdir: standing.workspaceRoot,
            timeoutMs,
            signal: exec.signal,
            // Python must not try to write bytecode under the read-only sandbox.
            env: { PYTHONDONTWRITEBYTECODE: '1' },
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
