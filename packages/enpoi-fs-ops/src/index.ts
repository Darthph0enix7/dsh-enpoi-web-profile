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
 * - fs.read    — text content + full-file sha256 + mtimeMs/size; refuses
 *                binary (NUL / invalid UTF-8), caps the returned content at
 *                4 MiB and flags `truncated` (never saveable, sha stays full)
 * - fs.write   — atomic optimistic save (expectedSha conflict / create-only),
 *                content-addressed pre-overwrite backup in
 *                ~/.dsh/file-history/editor/<sha256>, .dsh-tmp staging + fsync
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
import { mkdir, rename, stat, writeFile, rm, open, readFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

export const name = 'enpoi-fs-ops'
export const inject = ['webServer', 'webRuntime', 'sessions']

const TRASH_ROOT = join(homedir(), '.dsh', 'trash', 'sidebar')

/** Editor pre-overwrite backups are content-addressed under the user's home. */
function editorBackupPath(sha256: string): string {
  return join(homedir(), '.dsh', 'file-history', 'editor', sha256)
}

/** fs.read returns at most this many content bytes (sha/size stay full-file). */
const MAX_READ_BYTES = 4 * 1024 * 1024

/** Largest file the download route serves, in bytes (base64-inflated on the wire). */
const MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Read up to `length` bytes from position 0 of an open handle, short-read safe. */
async function readAtMost(handle: FileHandle, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, offset)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  return buffer.subarray(0, offset)
}

/**
 * Atomic replace: write a sibling `.dsh-tmp-<pid>-<rand>` file, fsync it, then
 * rename over the target (same filesystem). `mode` is applied to the temp file
 * so an existing target's permissions survive the rename; 0o644 for new files.
 * The temp file is removed on any failure — never left behind.
 */
async function writeFileAtomic(target: string, bytes: Buffer, mode: number): Promise<void> {
  const dir = dirname(target)
  const tmp = join(dir, `${basename(target)}.dsh-tmp-${process.pid}-${randomUUID().slice(0, 8)}`)
  await mkdir(dir, { recursive: true })
  let handle: FileHandle | undefined
  try {
    handle = await open(tmp, 'w', mode)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(tmp, target)
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => {})
    await rm(tmp, { force: true }).catch(() => {})
    throw new FsOpsError('fs-error', `cannot write "${target}": ${error instanceof Error ? error.message : String(error)}`, 400)
  }
}

/** Store pre-overwrite bytes under their digest; idempotent (wx + EEXIST skip). */
async function backupBytes(bytes: Buffer): Promise<string> {
  const dest = editorBackupPath(sha256Of(bytes))
  try {
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, bytes, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return dest
    throw new FsOpsError('fs-error', `cannot back up existing file: ${error instanceof Error ? error.message : String(error)}`, 400)
  }
  return dest
}

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

/**
 * Resolve one payload path against the session workspace.
 *
 * The file tree and chat links address files relative to the workspace root
 * (`notes.txt`), while an explicit absolute path is taken as-is. A relative
 * path needs the session's cwd; an absolute one never does.
 * @param payload - request body carrying the path and optionally a cwd/session.
 * @param sessions - session lookup used to derive the cwd.
 * @param key - payload field holding the path.
 * @returns the absolute, normalised path.
 */
function requireWorkspacePath(
  payload: unknown,
  sessions: { get?: (id: string) => { header?: { cwd?: string } } | undefined } | undefined,
  key = 'path',
): string {
  const raw = requireString(payload, key)
  if (isAbsolute(raw)) return resolve(raw)
  return resolve(cwdOf(payload, sessions), raw)
}

/** Validate a new entry name: no separators, no '..', not empty, not dot. */
function requireValidName(name: string): string {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new FsOpsError('bad-request', `invalid name "${name}"`, 400)
  }
  return name
}

/** Largest JSON request body accepted, in bytes: an editor save up to the read cap plus JSON escaping. */
const MAX_BODY_BYTES = 2 * MAX_READ_BYTES

async function readJsonBody(req: { on: (event: string, cb: (chunk: Buffer) => void) => unknown }): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new FsOpsError('bad-request', 'request body too large', 413)
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
      const path = requireWorkspacePath(payload, sessions)
      try {
        const info = await stat(path)
        return { ok: true, path, mtimeMs: info.mtimeMs, size: info.size, isDir: info.isDirectory() }
      } catch (error) {
        // A missing file is a state the editor renders ("File not found"), not a
        // failure: report it as 404 so the watcher can tell it apart from a read
        // error it should retry.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new FsOpsError('not-found', `"${path}" does not exist`, 404)
        }
        throw new FsOpsError('fs-error', `cannot stat "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
    },

    'fs.download': async (payload) => {
      const path = requireWorkspacePath(payload, sessions)
      let handle: FileHandle
      try {
        handle = await open(path, 'r')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new FsOpsError('not-found', `"${path}" does not exist`, 404)
        }
        throw new FsOpsError('fs-error', `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      try {
        const info = await handle.stat()
        if (info.isDirectory()) {
          throw new FsOpsError('fs-error', `"${path}" is a directory`, 400)
        }
        if (info.size > MAX_DOWNLOAD_BYTES) {
          throw new FsOpsError('too-large', `"${path}" is larger than ${MAX_DOWNLOAD_BYTES} bytes`, 413)
        }
        const bytes = await handle.readFile()
        return { base64: bytes.toString('base64'), size: bytes.length, name: basename(path) }
      } finally {
        await handle.close()
      }
    },

    'fs.read': async (payload) => {
      const path = requireWorkspacePath(payload, sessions)
      let handle: FileHandle
      try {
        handle = await open(path, 'r')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new FsOpsError('not-found', `"${path}" does not exist`, 404)
        }
        throw new FsOpsError('fs-error', `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
      }
      try {
        const info = await handle.stat()
        if (info.isDirectory()) {
          throw new FsOpsError('fs-error', `"${path}" is a directory`, 400)
        }
        const size = info.size
        const truncated = size > MAX_READ_BYTES
        const head = await readAtMost(handle, truncated ? MAX_READ_BYTES : size)
        if (head.includes(0)) {
          throw new FsOpsError('not-text', `"${path}" is binary (NUL byte)`, 400)
        }
        let content: string
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(head)
        } catch {
          throw new FsOpsError('not-text', `"${path}" is not valid UTF-8 text`, 400)
        }
        // The sha always covers the FULL file, so a truncated buffer can never
        // be mistaken for an up-to-date save candidate by change detection.
        let sha256: string
        if (!truncated) {
          sha256 = sha256Of(head)
        } else {
          const hash = createHash('sha256')
          const stream = handle.createReadStream({ start: 0, autoClose: false })
          for await (const chunk of stream) hash.update(chunk as Buffer)
          sha256 = hash.digest('hex')
        }
        return { content, sha256, mtimeMs: info.mtimeMs, size, truncated }
      } finally {
        await handle.close().catch(() => {})
      }
    },

    'fs.write': async (payload) => {
      const cwd = cwdOf(payload, sessions)
      const path = requireWorkspacePath(payload, sessions)
      const record = payload as Record<string, unknown> | null
      const content = record?.content
      if (typeof content !== 'string') {
        throw new FsOpsError('bad-request', 'missing or invalid "content"', 400)
      }
      const rawExpected = record?.expectedSha
      if (rawExpected !== undefined && rawExpected !== null && typeof rawExpected !== 'string') {
        throw new FsOpsError('bad-request', 'invalid "expectedSha"', 400)
      }
      const expectedSha = typeof rawExpected === 'string' ? rawExpected : null
      // `expectedSha: null` is an explicit create-only request; absent means force.
      const createOnly = rawExpected === null

      // Containment: same rule as fs.delete — never the workspace root, never
      // anything outside it (`relative` resolves dot-segments for us).
      const root = resolve(cwd)
      const rel = relative(root, path)
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
        throw new FsOpsError('fs-error', 'file must stay inside the workspace', 400)
      }

      const bytes = Buffer.from(content, 'utf8')
      const newSha = sha256Of(bytes)

      let existing: Buffer | null = null
      let mode = 0o644
      try {
        const info = await stat(path)
        if (info.isDirectory()) {
          throw new FsOpsError('fs-error', `"${path}" is a directory`, 400)
        }
        existing = await readFile(path)
        mode = info.mode & 0o777
      } catch (error) {
        if (error instanceof FsOpsError) throw error
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new FsOpsError('fs-error', `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400)
        }
      }

      let backup: string | null = null
      if (existing !== null) {
        if (createOnly) {
          throw new FsOpsError('exists', `"${path}" already exists`, 409)
        }
        if (expectedSha !== null && sha256Of(existing) !== expectedSha) {
          throw new FsOpsError('conflict', 'file changed on disk since it was read', 409)
        }
        // Zero data loss: every overwrite/truncate keeps the old bytes.
        backup = await backupBytes(existing)
      } else if (expectedSha !== null) {
        // The read source vanished — never silently recreate under an expectedSha.
        throw new FsOpsError('conflict', 'file changed on disk since it was read', 409)
      }

      await writeFileAtomic(path, bytes, mode)
      const info = await stat(path)
      return { sha256: newSha, mtimeMs: info.mtimeMs, size: bytes.length, backup }
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