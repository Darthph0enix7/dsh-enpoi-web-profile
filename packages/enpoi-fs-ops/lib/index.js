// src/index.ts
import Schema from "schemastery";
import { homedir } from "node:os";
import { join, dirname, basename, resolve, isAbsolute, relative } from "node:path";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
var name = "enpoi-fs-ops";
var inject = ["webServer", "webRuntime", "sessions"];
var TRASH_ROOT = join(homedir(), ".dsh", "trash", "sidebar");
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
  code;
  status;
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
function requireValidName(name2) {
  if (name2 === "" || name2 === "." || name2 === ".." || name2.includes("/") || name2.includes("\\")) {
    throw new FsOpsError("bad-request", `invalid name "${name2}"`, 400);
  }
  return name2;
}
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1 << 20) throw new FsOpsError("bad-request", "request body too large", 413);
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
      const destDir = join(TRASH_ROOT, `${Date.now()}-${basename(path)}`);
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
        await stat(target);
        throw new FsOpsError("fs-error", `"${target}" already exists`, 409);
      } catch (error) {
        if (error instanceof FsOpsError) throw error;
      }
      try {
        await mkdir(parent, { recursive: true });
        await writeFile(target, "", "utf8");
      } catch (error) {
        throw new FsOpsError("fs-error", `cannot create "${target}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
      return { ok: true, path: target };
    },
    "fs.stat": async (payload) => {
      const path = requireAbsolute(requireString(payload, "path"));
      try {
        const info = await stat(path);
        return { ok: true, path, mtimeMs: info.mtimeMs, size: info.size, isDir: info.isDirectory() };
      } catch (error) {
        throw new FsOpsError("fs-error", `cannot stat "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
      }
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
