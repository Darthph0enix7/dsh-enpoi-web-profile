/**
 * enpoi-fs-ops — file-system operations for the sidebar explorer.
 *
 * Fenced `/sidebar/fsops` JSON routes (same trust fence as the sidebar API:
 * loopback host or a configured trusted authority). Operations:
 * - fs.rename  — move a file/dir; refuses overwriting an existing target
 * - fs.delete  — move to ~/.dsh/trash/sidebar/<ms>-<basename> (never rm)
 * - fs.mkdir   — create a directory (recursive)
 * - fs.create  — create an empty file (refuses existing)
 * - fs.stat    — mtimeMs + size for the editor's external-change watcher
 *
 * Path safety mirrors dsh-better-sidebar's fs-tree: absolute paths only,
 * name validation (no '/', '..', empty), and the cwd root is never
 * deletable. The trash staging is standalone (Oracle: no coupling to
 * enpoi-file-revert's session-keyed trash).
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { homedir } from 'node:os'
import { join, dirname, basename, resolve, isAbsolute, relative } from 'node:path'
import { mkdir, rename, stat, writeFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

export const name = 'enpoi-fs-ops'
export const inject = ['webServer', 'webRuntime', 'sessions']

const TRASH_ROOT = join(homedir(), '.dsh', 'trash', 'sidebar')

export const Config = Schema.object({})

export interface FsOpsConfig {}

/** Structural subset of the node HTTP request the fence reads. */
interface TrustRequest {
  headers: IncomingHttpHeaders
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** DNS-rebinding / cross-site fence, behaviorally identical to the sidebar's. */
function isTrustedRequest(req: TrustRequest, trustedHosts: readonly string[]): boolean {
  const host = header(req.headers, 'host')
  if (host === undefined) return false
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  if (isLoopbackHostname(hostname)) return true
  return trustedHosts.some((entry) => {
    try {
      return new URL(`http://${entry}`).hostname === hostname
    } catch {
      return false
    }
  })
}

/** One API failure with its wire code and HTTP status. */
class FsOpsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

function requireString(payload: unknown, key: string): string {
  const record = payload as Record<string, unknown> | null
  const value = record?.[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new FsOpsError('bad-request', `missing or invalid "${key}"`, 400)
  }
  return value
}

function requireAbsolute(path: string): string {
  if (!isAbsolute(path)) {
    throw new FsOpsError('fs-error', `"${path}" is not an absolute path`, 400)
  }
  return resolve(path)
}

/** Validate a new entry name: no separators, no '..', not empty, not dot. */
function requireValidName(name: string): string {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new FsOpsError('bad-request', `invalid name "${name}"`, 400)
  }
  return name
}

async function readJsonBody(req: { on: (event: string, cb: (chunk: Buffer) => void) => unknown }): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    total += chunk.length
    if (total > (1 << 20)) throw new FsOpsError('bad-request', 'request body too large', 413)
    chunks.push(Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new FsOpsError('bad-request', 'malformed JSON body', 400)
  }
}

function writeJson(res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function writeOk(res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

function writeError(res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }, error: unknown): void {
  const err = error instanceof FsOpsError ? error : new FsOpsError('internal', error instanceof Error ? error.message : String(error), 500)
  writeJson(res, err.status, { ok: false, error: { code: err.code, message: err.message } })
}

/** Resolve the session cwd from the payload (mirror of the sidebar's cwdOf). */
function cwdOf(payload: unknown, sessions: { get?: (id: string) => { header?: { cwd?: string } } | undefined } | undefined): string {
  const record = payload as Record<string, unknown> | null
  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : ''
  const explicit = typeof record?.cwd === 'string' && record.cwd !== '' ? record.cwd : undefined
  if (explicit !== undefined) return explicit
  const session = sessionId !== '' ? sessions?.get?.(sessionId) : undefined
  const cwd = session?.header?.cwd
  if (typeof cwd !== 'string' || cwd === '') {
    throw new FsOpsError('fs-error', 'no working directory for this session', 400)
  }
  return cwd
}

export function apply(ctx: Context, _config: FsOpsConfig): void {
  const sessions = ctx.get('sessions') as { get?: (id: string) => { cwd?: string } | undefined } | undefined
  const trustedHosts = (ctx.get('webRuntime') as { trustedHosts?: readonly string[] } | undefined)?.trustedHosts ?? []

  const api: Record<string, (payload: unknown) => Promise<unknown>> = {
    'fs.rename': async (payload) => {
      const cwd = cwdOf(payload, sessions)
      const from = requireAbsolute(requireString(payload, 'from'))
      const to = requireAbsolute(requireString(payload, 'to'))
      if (from === cwd || relative(cwd, from) === '') {
        throw new FsOpsError('fs-error', 'cannot rename the workspace root', 400)
      }
      // Refuse overwriting an existing target (no silent clobber).
      try {
        await stat(to)
        throw new FsOpsError('fs-error', `"${to}" already exists`, 409)
      } catch (error) {
        if (error instanceof FsOpsError) throw error
        // ENOENT — target free, proceed.
      }
      try {
        await mkdir(dirname(to), { recursive: true })
        await rename(from, to)
      } catch (error) {
        throw new FsOpsError('fs-error', `cannot rename "${from}" → "${to}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      return { ok: true, from, to }
    },

    'fs.delete': async (payload) => {
      const cwd = cwdOf(payload, sessions)
      const path = requireAbsolute(requireString(payload, 'path'))
      if (path === cwd || relative(cwd, path) === '') {
        throw new FsOpsError('fs-error', 'cannot delete the workspace root', 400)
      }
      // Trash staging: never rm — recoverable by hand from ~/.dsh/trash/sidebar.
      // UUID suffix prevents same-millisecond same-basename collisions
      // (Oracle fix-soon #4).
      const destDir = join(TRASH_ROOT, `${Date.now()}-${randomUUID()}-${basename(path)}`)
      try {
        await mkdir(dirname(destDir), { recursive: true })
        await rename(path, destDir)
      } catch (error) {
        throw new FsOpsError('fs-error', `cannot delete "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      return { ok: true, dest: destDir }
    },

    'fs.mkdir': async (payload) => {
      const cwd = cwdOf(payload, sessions)
      const parent = requireAbsolute(requireString(payload, 'parent'))
      const name = requireValidName(requireString(payload, 'name'))
      const target = join(parent, name)
      if (relative(cwd, target) === '' || relative(cwd, target).startsWith('..')) {
        throw new FsOpsError('fs-error', 'new directory must stay inside the workspace', 400)
      }
      try {
        await mkdir(target, { recursive: false })
      } catch (error) {
        throw new FsOpsError('fs-error', `cannot create directory "${target}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      return { ok: true, path: target }
    },

    'fs.create': async (payload) => {
      const cwd = cwdOf(payload, sessions)
      const parent = requireAbsolute(requireString(payload, 'parent'))
      const name = requireValidName(requireString(payload, 'name'))
      const target = join(parent, name)
      if (relative(cwd, target) === '' || relative(cwd, target).startsWith('..')) {
        throw new FsOpsError('fs-error', 'new file must stay inside the workspace', 400)
      }
      try {
        // 'wx' = fail if the file exists (atomic no-clobber — closes the
        // stat-then-write TOCTOU truncation window, Oracle fix-soon #1).
        await mkdir(parent, { recursive: true })
        await writeFile(target, '', { flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new FsOpsError('fs-error', `"${target}" already exists`, 409)
        }
        throw new FsOpsError('fs-error', `cannot create "${target}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      return { ok: true, path: target }
    },

    'fs.stat': async (payload) => {
      const path = requireAbsolute(requireString(payload, 'path'))
      try {
        const info = await stat(path)
        return { ok: true, path, mtimeMs: info.mtimeMs, size: info.size, isDir: info.isDirectory() }
      } catch (error) {
        throw new FsOpsError('fs-error', `cannot stat "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
    },
  }

  ctx.effect(() => {
    const webServer = ctx.get('webServer') as {
      register?: (spec: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> | void }) => unknown
    } | undefined
    if (webServer?.register === undefined) return () => {}
    return webServer.register({
      kind: 'prefix',
      path: '/sidebar/fsops',
      handler: async (req, res) => {
        const httpReq = req as {
          headers: IncomingHttpHeaders
          method?: string
          url?: string
          on: (event: string, cb: (chunk: Buffer) => void) => unknown
        }
        const httpRes = res as {
          writeHead: (status: number, headers: Record<string, string>) => void
          end: (body: string) => void
        }
        if (!isTrustedRequest(httpReq, trustedHosts)) {
          writeJson(httpRes, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
          return
        }
        // Cross-site simple-request CSRF (Oracle B1): a text/plain POST from
        // a malicious page is a CORS simple request — no preflight — and the
        // fence (Host-only) would let it through. Requiring application/json
        // forces a preflight for cross-site JSON, which our 405 on OPTIONS
        // blocks. Also reject any explicit untrusted Origin outright.
        const contentType = header(httpReq.headers, 'content-type') ?? ''
        if (!contentType.toLowerCase().includes('application/json')) {
          writeJson(httpRes, 415, { ok: false, error: { code: 'bad-request', message: 'content-type must be application/json' } })
          return
        }
        const origin = header(httpReq.headers, 'origin')
        if (origin !== undefined && origin !== 'null') {
          let originHost: string
          try {
            originHost = new URL(origin).hostname
          } catch {
            writeJson(httpRes, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
            return
          }
          if (!isLoopbackHostname(originHost) && !trustedHosts.some((entry) => {
            try { return new URL(`http://${entry}`).hostname === originHost } catch { return false }
          })) {
            writeJson(httpRes, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
            return
          }
        }
        if (httpReq.method !== 'POST') {
          writeJson(httpRes, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
          return
        }
        const pathname = new URL(httpReq.url ?? '/', 'http://dsh.internal').pathname
        const method = pathname.startsWith('/sidebar/fsops/') ? pathname.slice('/sidebar/fsops/'.length) : undefined
        if (method === undefined || method.includes('/')) {
          writeError(httpRes, new FsOpsError('not-found', 'unknown fsops method', 404))
          return
        }
        try {
          const payload = await readJsonBody(httpReq)
          const handler = api[method]
          if (handler === undefined) {
            throw new FsOpsError('not-found', `unknown fsops method "${method}"`, 404)
          }
          writeOk(httpRes, await handler(payload))
        } catch (error) {
          writeError(httpRes, error)
        }
      },
    })
  }, 'dsh-enpoi-fs-ops: /sidebar/fsops routes')
}