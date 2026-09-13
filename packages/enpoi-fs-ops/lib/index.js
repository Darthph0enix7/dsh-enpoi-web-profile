// src/index.ts
import Schema from "schemastery";
import { homedir } from "node:os";
import { join, dirname, basename, resolve, isAbsolute, relative } from "node:path";
import { mkdir, rename, stat, writeFile, rm, open, readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
var name = "enpoi-fs-ops";
var inject = ["webServer", "webRuntime", "sessions"];
var TRASH_ROOT = join(homedir(), ".dsh", "trash", "sidebar");
function editorBackupPath(sha256) {
  return join(homedir(), ".dsh", "file-history", "editor", sha256);
}
var MAX_READ_BYTES = 4 * 1024 * 1024;
function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
async function readAtMost(handle, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}
async function writeFileAtomic(target, bytes, mode) {
  const dir = dirname(target);
  const tmp = join(dir, `${basename(target)}.dsh-tmp-${process.pid}-${randomUUID().slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  let handle;
  try {
    handle = await open(tmp, "w", mode);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = void 0;
    await rename(tmp, target);
  } catch (error) {
    if (handle !== void 0) await handle.close().catch(() => {
    });
    await rm(tmp, { force: true }).catch(() => {
    });
    throw new FsOpsError("fs-error", `cannot write "${target}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
}
async function backupBytes(bytes) {
  const dest = editorBackupPath(sha256Of(bytes));
  try {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") return dest;
    throw new FsOpsError("fs-error", `cannot back up existing file: ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  return dest;
}
var Config = Schema.object({});
function header(headers, name2) {
  const value = headers[name2];
  return typeof value === "string" ? value : void 0;
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isTrustedRequest(req, trustedHosts) {
  const host = header(req.headers, "host");
  if (host === void 0) return false;
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  if (isLoopbackHostname(hostname)) return true;
  return trustedHosts.some((entry) => {
    try {
      return new URL(`http://${entry}`).hostname === hostname;
    } catch {
      return false;
    }
  });
}
var FsOpsError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
function requireString(payload, key) {
  const record = payload;
  const value = record?.[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new FsOpsError("bad-request", `missing or invalid "${key}"`, 400);
  }
  return value;
}
function requireAbsolute(path) {
  if (!isAbsolute(path)) {
    throw new FsOpsError("fs-error", `"${path}" is not an absolute path`, 400);
  }
  return resolve(path);
}
function requireWorkspacePath(payload, sessions, key = "path") {
  const raw = requireString(payload, key);
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(cwdOf(payload, sessions), raw);
}
function requireValidName(name2) {
  if (name2 === "" || name2 === "." || name2 === ".." || name2.includes("/") || name2.includes("\\")) {
    throw new FsOpsError("bad-request", `invalid name "${name2}"`, 400);
  }
  return name2;
}
var MAX_BODY_BYTES = 2 * MAX_READ_BYTES;
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new FsOpsError("bad-request", "request body too large", 413);
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FsOpsError("bad-request", "malformed JSON body", 400);
  }
}
function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}
function writeError(res, error) {
  const err = error instanceof FsOpsError ? error : new FsOpsError("internal", error instanceof Error ? error.message : String(error), 500);
  writeJson(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
}
function cwdOf(payload, sessions) {
  const record = payload;
  const sessionId = typeof record?.sessionId === "string" ? record.sessionId : "";
  const explicit = typeof record?.cwd === "string" && record.cwd !== "" ? record.cwd : void 0;
  if (explicit !== void 0) return explicit;
  const session = sessionId !== "" ? sessions?.get?.(sessionId) : void 0;
  const cwd = session?.header?.cwd;
  if (typeof cwd !== "string" || cwd === "") {
    throw new FsOpsError("fs-error", "no working directory for this session", 400);
  }
  return cwd;
}
function apply(ctx, _config) {
  const sessions = ctx.get("sessions");
  const trustedHosts = ctx.get("webRuntime")?.trustedHosts ?? [];
  const api = {
    "fs.rename": async (payload) => {
      const cwd = cwdOf(payload, sessions);
      const from = requireAbsolute(requireString(payload, "from"));
      const to = requireAbsolute(requireString(payload, "to"));
      if (from === cwd || relative(cwd, from) === "") {
        throw new FsOpsError("fs-error", "cannot rename the workspace root", 400);
      }
      try {
        await stat(to);
        throw new FsOpsError("fs-error", `"${to}" already exists`, 409);
      } catch (error) {
        if (error instanceof FsOpsError) throw error;
      }
      try {
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
      } catch (error) {
        throw new FsOpsError("fs-error", `cannot rename "${from}" \u2192 "${to}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      return { ok: true, from, to };
    },
    "fs.delete": async (payload) => {
      const cwd = cwdOf(payload, sessions);
      const path = requireAbsolute(requireString(payload, "path"));
      if (path === cwd || relative(cwd, path) === "") {
        throw new FsOpsError("fs-error", "cannot delete the workspace root", 400);
      }
      const destDir = join(TRASH_ROOT, `${Date.now()}-${randomUUID()}-${basename(path)}`);
      try {
        await mkdir(dirname(destDir), { recursive: true });
        await rename(path, destDir);
      } catch (error) {
        throw new FsOpsError("fs-error", `cannot delete "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      return { ok: true, dest: destDir };
    },
    "fs.mkdir": async (payload) => {
      const cwd = cwdOf(payload, sessions);
      const parent = requireAbsolute(requireString(payload, "parent"));
      const name2 = requireValidName(requireString(payload, "name"));
      const target = join(parent, name2);
      if (relative(cwd, target) === "" || relative(cwd, target).startsWith("..")) {
        throw new FsOpsError("fs-error", "new directory must stay inside the workspace", 400);
      }
      try {
        await mkdir(target, { recursive: false });
      } catch (error) {
        throw new FsOpsError("fs-error", `cannot create directory "${target}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      return { ok: true, path: target };
    },
    "fs.create": async (payload) => {
      const cwd = cwdOf(payload, sessions);
      const parent = requireAbsolute(requireString(payload, "parent"));
      const name2 = requireValidName(requireString(payload, "name"));
      const target = join(parent, name2);
      if (relative(cwd, target) === "" || relative(cwd, target).startsWith("..")) {
        throw new FsOpsError("fs-error", "new file must stay inside the workspace", 400);
      }
      try {
        await mkdir(parent, { recursive: true });
        await writeFile(target, "", { flag: "wx" });
      } catch (error) {
        if (error.code === "EEXIST") {
          throw new FsOpsError("fs-error", `"${target}" already exists`, 409);
        }
        throw new FsOpsError("fs-error", `cannot create "${target}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      return { ok: true, path: target };
    },
    "fs.stat": async (payload) => {
      const path = requireWorkspacePath(payload, sessions);
      try {
        const info = await stat(path);
        return { ok: true, path, mtimeMs: info.mtimeMs, size: info.size, isDir: info.isDirectory() };
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new FsOpsError("not-found", `"${path}" does not exist`, 404);
        }
        throw new FsOpsError("fs-error", `cannot stat "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
    },
    "fs.read": async (payload) => {
      const path = requireWorkspacePath(payload, sessions);
      let handle;
      try {
        handle = await open(path, "r");
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new FsOpsError("not-found", `"${path}" does not exist`, 404);
        }
        throw new FsOpsError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      try {
        const info = await handle.stat();
        if (info.isDirectory()) {
          throw new FsOpsError("fs-error", `"${path}" is a directory`, 400);
        }
        const size = info.size;
        const truncated = size > MAX_READ_BYTES;
        const head = await readAtMost(handle, truncated ? MAX_READ_BYTES : size);
        if (head.includes(0)) {
          throw new FsOpsError("not-text", `"${path}" is binary (NUL byte)`, 400);
        }
        let content;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(head);
        } catch {
          throw new FsOpsError("not-text", `"${path}" is not valid UTF-8 text`, 400);
        }
        let sha256;
        if (!truncated) {
          sha256 = sha256Of(head);
        } else {
          const hash = createHash("sha256");
          const stream = handle.createReadStream({ start: 0, autoClose: false });
          for await (const chunk of stream) hash.update(chunk);
          sha256 = hash.digest("hex");
        }
        return { content, sha256, mtimeMs: info.mtimeMs, size, truncated };
      } finally {
        await handle.close().catch(() => {
        });
      }
    },
    "fs.write": async (payload) => {
      const cwd = cwdOf(payload, sessions);
      const path = requireWorkspacePath(payload, sessions);
      const record = payload;
      const content = record?.content;
      if (typeof content !== "string") {
        throw new FsOpsError("bad-request", 'missing or invalid "content"', 400);
      }
      const rawExpected = record?.expectedSha;
      if (rawExpected !== void 0 && rawExpected !== null && typeof rawExpected !== "string") {
        throw new FsOpsError("bad-request", 'invalid "expectedSha"', 400);
      }
      const expectedSha = typeof rawExpected === "string" ? rawExpected : null;
      const createOnly = rawExpected === null;
      const root = resolve(cwd);
      const rel = relative(root, path);
      if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
        throw new FsOpsError("fs-error", "file must stay inside the workspace", 400);
      }
      const bytes = Buffer.from(content, "utf8");
      const newSha = sha256Of(bytes);
      let existing = null;
      let mode = 420;
      try {
        const info2 = await stat(path);
        if (info2.isDirectory()) {
          throw new FsOpsError("fs-error", `"${path}" is a directory`, 400);
        }
        existing = await readFile(path);
        mode = info2.mode & 511;
      } catch (error) {
        if (error instanceof FsOpsError) throw error;
        if (error.code !== "ENOENT") {
          throw new FsOpsError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
        }
      }
      let backup = null;
      if (existing !== null) {
        if (createOnly) {
          throw new FsOpsError("exists", `"${path}" already exists`, 409);
        }
        if (expectedSha !== null && sha256Of(existing) !== expectedSha) {
          throw new FsOpsError("conflict", "file changed on disk since it was read", 409);
        }
        backup = await backupBytes(existing);
      } else if (expectedSha !== null) {
        throw new FsOpsError("conflict", "file changed on disk since it was read", 409);
      }
      await writeFileAtomic(path, bytes, mode);
      const info = await stat(path);
      return { sha256: newSha, mtimeMs: info.mtimeMs, size: bytes.length, backup };
    }
  };
  ctx.effect(() => {
    const webServer = ctx.get("webServer");
    if (webServer?.register === void 0) return () => {
    };
    return webServer.register({
      kind: "prefix",
      path: "/sidebar/fsops",
      handler: async (req, res) => {
        const httpReq = req;
        const httpRes = res;
        if (!isTrustedRequest(httpReq, trustedHosts)) {
          writeJson(httpRes, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
          return;
        }
        const contentType = header(httpReq.headers, "content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          writeJson(httpRes, 415, { ok: false, error: { code: "bad-request", message: "content-type must be application/json" } });
          return;
        }
        const origin = header(httpReq.headers, "origin");
        if (origin !== void 0 && origin !== "null") {
          let originHost;
          try {
            originHost = new URL(origin).hostname;
          } catch {
            writeJson(httpRes, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
            return;
          }
          if (!isLoopbackHostname(originHost) && !trustedHosts.some((entry) => {
            try {
              return new URL(`http://${entry}`).hostname === originHost;
            } catch {
              return false;
            }
          })) {
            writeJson(httpRes, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
            return;
          }
        }
        if (httpReq.method !== "POST") {
          writeJson(httpRes, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
          return;
        }
        const pathname = new URL(httpReq.url ?? "/", "http://dsh.internal").pathname;
        const method = pathname.startsWith("/sidebar/fsops/") ? pathname.slice("/sidebar/fsops/".length) : void 0;
        if (method === void 0 || method.includes("/")) {
          writeError(httpRes, new FsOpsError("not-found", "unknown fsops method", 404));
          return;
        }
        try {
          const payload = await readJsonBody(httpReq);
          const handler = api[method];
          if (handler === void 0) {
            throw new FsOpsError("not-found", `unknown fsops method "${method}"`, 404);
          }
          writeOk(httpRes, await handler(payload));
        } catch (error) {
          writeError(httpRes, error);
        }
      }
    });
  }, "dsh-enpoi-fs-ops: /sidebar/fsops routes");
}
export {
  Config,
  apply,
  inject,
  name
};
