import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { installReviewRunTool, REVIEW_RUN_DEFAULT_TIMEOUT_MS, REVIEW_RUN_MAX_TIMEOUT_MS } from '../src/review-run'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'

interface FakeToolDefinition {
  name: string
  execute: (args: unknown, exec: { agent?: unknown; signal?: AbortSignal }) => Promise<unknown>
}

interface Registered {
  definition: FakeToolDefinition
  specs: ShellExecSpec[]
}

function fakeShell(sandboxMode: string | undefined): { shell: unknown; specs: ShellExecSpec[] } {
  const specs: ShellExecSpec[] = []
  const shell = {
    sandboxMode,
    resolve(request: ShellExecRequest): ShellExecSpec {
      return {
        command: request.command,
        workdir: request.workdir ?? '/ws',
        timeoutMs: request.timeoutMs ?? 1000,
        onExpiry: 'kill',
        stdoutMaxBytes: 65536,
        signal: request.signal,
        env: request.env,
        sandboxPolicy: request.sandboxPolicy,
      }
    },
    async execute(spec: ShellExecSpec) {
      specs.push(spec)
      return {
        status: 'completed',
        exitCode: 0,
        signal: null,
        done: Promise.resolve(),
        result: async () => ({
          exitCode: 0,
          signal: null,
          timedOut: false,
          timeoutMs: spec.timeoutMs,
          stdout: { text: '1 passed', truncated: false },
          stderr: { text: '', truncated: false },
          sandbox: { mode: spec.sandboxPolicy?.mode ?? 'read-only', denied: false },
        }),
      }
    },
  }
  return { shell, specs }
}

async function setup(options: { sandboxMode?: string | undefined; withPolicy?: boolean } = {}): Promise<Registered> {
  const ctx = new Context()
  let registered: FakeToolDefinition | undefined
  ctx.provide('tools', {
    register(definition: FakeToolDefinition) {
      registered = definition
      return () => {}
    },
  } as never)
  const { shell, specs } = fakeShell('sandboxMode' in options ? options.sandboxMode : 'workspace-write')
  ctx.provide('shell', shell as never)
  if (options.withPolicy !== false) {
    ctx.provide('sandboxPolicy', {
      resolve: (request?: { session?: { id?: string } }) => ({ mode: 'workspace-write', workspaceRoot: '/ws', sessionId: request?.session?.id }),
    } as never)
  }
  await ctx.plugin({ apply: (pluginCtx: Context) => { installReviewRunTool(pluginCtx) } })
  await ctx.fiber.await()
  if (registered === undefined) throw new Error('review_run was not registered')
  return { definition: registered, specs }
}

const oracle = { id: 'a1', session: { header: { agentPreset: 'oracle' } } }
const fixer = { id: 'a2', session: { header: { agentPreset: 'fixer' } } }

describe('review_run registration fence', () => {
  it('registers nothing without a confining executor or a sandbox policy service', async () => {
    await expect(setup({ sandboxMode: undefined })).rejects.toThrow(/not registered/)
    await expect(setup({ withPolicy: false })).rejects.toThrow(/not registered/)
  })

  it('runs the fixed command read-only in the workspace root for an oracle seat', async () => {
    const { definition, specs } = await setup()
    expect(definition.name).toBe('review_run')
    const value = await definition.execute(
      { runner: 'pytest', target: 'tests/unit/test_x.py' },
      { agent: oracle, signal: new AbortController().signal },
    )
    expect(value).toMatchObject({ runner: 'pytest', exitCode: 0, stdout: '1 passed' })
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({
      command: "python3 -m pytest -q 'tests/unit/test_x.py'",
      workdir: '/ws',
      timeoutMs: REVIEW_RUN_DEFAULT_TIMEOUT_MS,
      env: { PYTHONDONTWRITEBYTECODE: '1' },
    })
    // Forced read-only: the executor's writable-root list is empty under this
    // policy, so the run cannot mutate the workspace.
    expect(specs[0]?.sandboxPolicy).toMatchObject({ mode: 'read-only', workspaceRoot: '/ws' })
  })

  it('refuses non-reviewer roles in the tool body even when policy is bypassed', async () => {
    const { definition, specs } = await setup()
    await expect(definition.execute({ runner: 'pytest' }, { agent: fixer })).rejects.toThrow(/reviewer\/oracle seats/)
    expect(specs).toHaveLength(0)
  })

  it('clamps the requested timeout into the accepted window', async () => {
    const { definition, specs } = await setup()
    await definition.execute({ runner: 'node-test', timeoutSeconds: 9999 }, { agent: oracle })
    expect(specs[0]?.timeoutMs).toBe(REVIEW_RUN_MAX_TIMEOUT_MS)
  })

  it('returns a bounded error value instead of throwing when execution fails', async () => {
    const ctx = new Context()
    let registered: FakeToolDefinition | undefined
    ctx.provide('tools', { register: (definition: FakeToolDefinition) => { registered = definition; return () => {} } } as never)
    const { shell } = fakeShell('workspace-write')
    const failing = Object.assign({}, shell, { execute: vi.fn(async () => { throw new Error('spawn denied') }) })
    ctx.provide('shell', failing as never)
    ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/ws' }) } as never)
    await ctx.plugin({ apply: (pluginCtx: Context) => { installReviewRunTool(pluginCtx) } })
    await ctx.fiber.await()
    const value = await registered?.execute({ runner: 'pytest' }, { agent: oracle }) as { error?: string }
    expect(value.error).toContain('spawn denied')
  })
})
