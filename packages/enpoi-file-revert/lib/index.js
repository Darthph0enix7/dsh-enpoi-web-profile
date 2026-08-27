// src/index.ts
import Schema from "schemastery";
import { homedir } from "node:os";
import { join as join4 } from "node:path";
import { randomUUID as randomUUID2, createHash as createHash2 } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";

// src/blob-store.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
var BlobStore = class {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }
  rootDir;
  async init() {
    await mkdir(this.rootDir, { recursive: true });
  }
  async put(bytes) {
    const sha = sha256Of(bytes);
    const path = join(this.rootDir, sha);
    try {
      await writeFile(path, bytes, { flag: "wx" });
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    return sha;
  }
  async get(sha) {
    if (sha === null) return null;
    return readFile(join(this.rootDir, sha));
  }
  /**
   * Reachability GC: sweep unreferenced blobs older than ttlMs.
   * @param liveShas — every SHA referenced by live records anywhere
   */
  async gc(liveShas, ttlMs, now = Date.now()) {
    const live = new Set(liveShas);
    const entries = await readdir(this.rootDir);
    for (const name2 of entries) {
      if (live.has(name2)) continue;
      const path = join(this.rootDir, name2);
      try {
        const st = await stat(path);
        if (now - st.mtimeMs > ttlMs) await unlink(path);
      } catch {
      }
    }
  }
};

// src/manifest.ts
import { mkdir as mkdir2, readFile as readFile2, appendFile } from "node:fs/promises";
import { join as join2 } from "node:path";
var MutationManifest = class {
  constructor(filePath) {
    this.filePath = filePath;
    this.ready = this.init();
  }
  filePath;
  records = [];
  ready;
  async init() {
    try {
      const raw = await readFile2(this.filePath, "utf8");
      const lines = raw.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        try {
          this.records.push(JSON.parse(line));
        } catch {
          if (i !== lines.length - 1) throw new Error(`corrupt manifest line ${i + 1}`);
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  async append(record) {
    await this.ready;
    const prior = this.lastFor(record.targetKey);
    if (prior !== void 0 && prior.postBlobSha !== record.preBlobSha) {
      record.isInterleaved = true;
    }
    this.records.push(record);
    await mkdir2(join2(this.filePath, ".."), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(record) + "\n", "utf8");
    return record;
  }
  lastFor(targetKey) {
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i].targetKey === targetKey) return this.records[i];
    }
    return void 0;
  }
  inSpan(fromSeq) {
    return this.records.filter((r) => r.toolSeq >= fromSeq);
  }
  upTo(seq) {
    return this.records.filter((r) => r.toolSeq <= seq);
  }
  aggregateSpan(fromSeq) {
    const span = this.inSpan(fromSeq);
    const byKey = /* @__PURE__ */ new Map();
    for (const rec of span) {
      let entry = byKey.get(rec.targetKey);
      if (entry === void 0) {
        entry = { initialPre: rec, finalPost: rec, records: [] };
        byKey.set(rec.targetKey, entry);
      }
      entry.records.push(rec);
      if (rec.toolSeq < entry.initialPre.toolSeq) entry.initialPre = rec;
      if (rec.toolSeq > entry.finalPost.toolSeq) entry.finalPost = rec;
    }
    return byKey;
  }
  /**
   * Resolve the target state for a boundary: latest mutation ≤ seq (post),
   * falling back to the initial pre-state; `null` boundary resolves to the
   * final post-state (restore-all).
   */
  resolveRestoreTarget(targetKey, restoreSeq) {
    if (restoreSeq === null) {
      const spanRecs = this.records.filter((r) => r.targetKey === targetKey);
      if (spanRecs.length === 0) return { preExisted: false, preStatus: "ok", preBlobSha: null, postBlobSha: null, isInterleaved: false };
      const latest2 = spanRecs.reduce((a, b) => b.toolSeq > a.toolSeq ? b : a);
      return {
        preExisted: latest2.preExisted,
        preStatus: latest2.preStatus,
        preBlobSha: latest2.preBlobSha,
        postBlobSha: latest2.postBlobSha,
        isInterleaved: spanRecs.some((r) => r.isInterleaved)
      };
    }
    const recs = this.upTo(restoreSeq).filter((r) => r.targetKey === targetKey);
    if (recs.length === 0) {
      const spanRecs = this.records.filter((r) => r.targetKey === targetKey);
      if (spanRecs.length === 0) return { preExisted: false, preStatus: "ok", preBlobSha: null, postBlobSha: null, isInterleaved: false };
      const earliest = spanRecs.reduce((a, b) => b.toolSeq < a.toolSeq ? b : a);
      return {
        preExisted: earliest.preExisted,
        preStatus: earliest.preStatus,
        preBlobSha: earliest.preBlobSha,
        postBlobSha: null,
        isInterleaved: false
      };
    }
    const latest = recs.reduce((a, b) => b.toolSeq > a.toolSeq ? b : a);
    const chainInterleaved = recs.some((r) => r.isInterleaved) || this.records.some((r) => r.targetKey === targetKey && r.toolSeq > restoreSeq && r.isInterleaved);
    return {
      preExisted: latest.preExisted,
      preStatus: latest.preStatus,
      preBlobSha: latest.preBlobSha,
      postBlobSha: latest.postBlobSha,
      isInterleaved: chainInterleaved
    };
  }
  /** All SHAs referenced by live records (for reachability GC). */
  liveShas() {
    const shas = /* @__PURE__ */ new Set();
    for (const r of this.records) {
      if (r.preBlobSha !== null) shas.add(r.preBlobSha);
      if (r.postBlobSha !== null) shas.add(r.postBlobSha);
    }
    return shas;
  }
};

// src/evaluator.ts
var STATE = {
  CLEAN_RESTORE: "clean_restore",
  CLEAN_TRASH: "clean_trash",
  ALREADY_CLEAN: "already_clean",
  CONFLICT: "conflict",
  ALREADY_ABSENT: "already_absent",
  MISSING: "missing",
  UNAVAILABLE: "unavailable"
};
function evaluateBoundary(entry, target, currentSha) {
  const { initialPre, finalPost } = entry;
  const postSha = finalPost.postBlobSha;
  const preSha = initialPre.preBlobSha;
  const targetSha = target.postBlobSha ?? target.preBlobSha;
  const targetAbsent = target.postBlobSha === null && target.preBlobSha === null;
  if (initialPre.preExisted && initialPre.preStatus !== "ok") {
    return {
      state: STATE.UNAVAILABLE,
      action: "skip",
      targetBlobSha: null,
      expectedDiskSha: currentSha,
      reason: `pre-agent snapshot unavailable (${initialPre.preStatus})`
    };
  }
  if (finalPost.postStatus !== "ok" || postSha === null) {
    return {
      state: STATE.UNAVAILABLE,
      action: "skip",
      targetBlobSha: targetSha,
      expectedDiskSha: currentSha,
      reason: `post-agent snapshot unavailable (${finalPost.postStatus})`
    };
  }
  if (currentSha === null) {
    if (targetAbsent) {
      return { state: STATE.ALREADY_ABSENT, action: "noop", targetBlobSha: null, expectedDiskSha: null };
    }
    return {
      state: STATE.MISSING,
      action: "prompt",
      targetBlobSha: targetSha,
      expectedDiskSha: null,
      reason: "file is missing on disk but the revert boundary expects it to exist"
    };
  }
  if (currentSha === targetSha) {
    return { state: STATE.ALREADY_CLEAN, action: "noop", targetBlobSha: null, expectedDiskSha: currentSha };
  }
  if (currentSha === postSha || preSha !== null && currentSha === preSha) {
    if (targetAbsent) {
      return { state: STATE.CLEAN_TRASH, action: "trash", targetBlobSha: null, expectedDiskSha: postSha };
    }
    return { state: STATE.CLEAN_RESTORE, action: "restore", targetBlobSha: targetSha, expectedDiskSha: currentSha };
  }
  return {
    state: STATE.CONFLICT,
    action: "prompt",
    targetBlobSha: targetSha,
    expectedDiskSha: currentSha,
    reason: "current disk content differs from both the boundary state and the agent post-state"
  };
}

// src/executor.ts
import { mkdir as mkdir3, readFile as readFile3, appendFile as appendFile2, writeFile as writeFile2, rename } from "node:fs/promises";
import { join as join3, dirname } from "node:path";
import { randomUUID } from "node:crypto";
var RevertExecutor = class {
  constructor(opts) {
    this.opts = opts;
    this.ready = this.init();
  }
  opts;
  wal = [];
  ready;
  async init() {
    await mkdir3(this.opts.trashRoot, { recursive: true });
    try {
      const raw = await readFile3(this.opts.walFile, "utf8");
      const lines = raw.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        try {
          this.wal.push(JSON.parse(line));
        } catch {
          if (i !== lines.length - 1) throw new Error(`corrupt WAL line ${i + 1}`);
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  /** Append-only WAL write (never full-file rewrite). */
  async writeWal(entry) {
    await this.ready;
    this.wal.push(entry);
    await mkdir3(dirname(this.opts.walFile), { recursive: true });
    await appendFile2(this.opts.walFile, JSON.stringify(entry) + "\n", "utf8");
  }
  /** Atomic write: temp file in same dir + rename (crash-safe, same-filesystem). */
  async atomicWrite(targetPath, bytes) {
    const dir = dirname(targetPath);
    await mkdir3(dir, { recursive: true });
    const tmp = join3(dir, `.fr-tmp-${randomUUID()}`);
    await writeFile2(tmp, bytes);
    await rename(tmp, targetPath);
  }
  /** Move a file to the trash staging area; unique dest (uuid) prevents collisions. */
  async trash(targetPath, sessionId) {
    const destDir = join3(this.opts.trashRoot, sessionId, String(Date.now()));
    await mkdir3(destDir, { recursive: true });
    const dest = join3(destDir, `${randomUUID()}-${targetPath.split("/").pop() ?? "file"}`);
    await rename(targetPath, dest);
    return dest;
  }
  /**
   * Execute a revert plan with WAL protection.
   * On unexpected exception: DO NOT seal — leave the intent unsealed so
   * startup recovery re-runs it (idempotent by hash).
   */
  async execute(opts) {
    const intent = {
      kind: "intent",
      sessionId: opts.sessionId,
      revertSeq: opts.revertSeq,
      plan: Object.fromEntries([...opts.plan].map(([key, p]) => [key, { action: p.action, targetBlobSha: p.targetBlobSha, expectedDiskSha: p.expectedDiskSha }])),
      ts: Date.now()
    };
    await this.writeWal(intent);
    const outcomes = {};
    let interrupted = false;
    try {
      for (const [targetKey, p] of opts.plan) {
        const action = p.action.startsWith("resolve:") ? p.action.slice("resolve:".length) : p.action;
        if (action === "noop") {
          outcomes[targetKey] = { status: "no_op" };
          continue;
        }
        if (action === "prompt" || action === "skip") {
          outcomes[targetKey] = { status: "pending_conflict" };
          continue;
        }
        const current = await opts.readDisk(targetKey);
        const currentSha = current === null ? null : sha256Of(current);
        if (p.expectedDiskSha !== null && currentSha !== p.expectedDiskSha) {
          outcomes[targetKey] = { status: "conflict_escalated", reason: "disk changed between evaluation and write" };
          continue;
        }
        const path = await opts.resolvePath(targetKey);
        if (action === "restore") {
          let bytes;
          try {
            bytes = await this.opts.blobStore.get(p.targetBlobSha);
          } catch {
            outcomes[targetKey] = { status: "conflict_escalated", reason: "pre-agent blob missing from store" };
            continue;
          }
          if (bytes === null) {
            outcomes[targetKey] = { status: "conflict_escalated", reason: "pre-agent blob missing from store" };
            continue;
          }
          await opts.writeDisk(path, bytes);
          const verify = await opts.readDisk(targetKey);
          if (verify === null || sha256Of(verify) !== p.targetBlobSha) {
            outcomes[targetKey] = { status: "conflict_escalated", reason: "post-write verification failed" };
            continue;
          }
          outcomes[targetKey] = { status: "restored", fromSha: p.expectedDiskSha, toSha: p.targetBlobSha };
        } else if (action === "trash") {
          const dest = await opts.trashFile(path);
          outcomes[targetKey] = { status: "trashed", dest };
        }
      }
    } catch (err) {
      interrupted = true;
      outcomes._error = { status: "error", _error: String(err) };
      return { outcomes, interrupted, sealed: false };
    }
    await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes, ts: Date.now() });
    return { outcomes, interrupted, sealed: true };
  }
  /**
   * Apply a user conflict resolution for one file, with the same WAL + TOCTOU
   * discipline as auto-revert.
   */
  async applyResolution(opts) {
    await this.writeWal({
      kind: "intent",
      sessionId: opts.sessionId,
      revertSeq: opts.revertSeq,
      plan: { [opts.targetKey]: { action: `resolve:${opts.resolution}`, targetBlobSha: opts.targetBlobSha, expectedDiskSha: opts.expectedDiskSha } },
      ts: Date.now()
    });
    if (opts.resolution === "keep") {
      const outcome2 = { status: "kept" };
      await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes: { [opts.targetKey]: outcome2 }, ts: Date.now() });
      return outcome2;
    }
    const current = await opts.readDisk(opts.targetKey);
    const currentSha = current === null ? null : sha256Of(current);
    if (opts.expectedDiskSha !== null && currentSha !== opts.expectedDiskSha) {
      const outcome2 = { status: "conflict_escalated", reason: "disk changed since the conflict was presented" };
      await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes: { [opts.targetKey]: outcome2 }, ts: Date.now() });
      return outcome2;
    }
    const path = await opts.resolvePath(opts.targetKey);
    let outcome;
    if (opts.resolution === "restore" || opts.resolution === "recreate") {
      let bytes;
      try {
        bytes = await this.opts.blobStore.get(opts.targetBlobSha);
      } catch {
        outcome = { status: "conflict_escalated", reason: "pre-agent blob missing from store" };
        await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes: { [opts.targetKey]: outcome }, ts: Date.now() });
        return outcome;
      }
      if (bytes === null) {
        outcome = { status: "conflict_escalated", reason: "pre-agent blob missing from store" };
        await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes: { [opts.targetKey]: outcome }, ts: Date.now() });
        return outcome;
      }
      await opts.writeDisk(path, bytes);
      const verify = await opts.readDisk(opts.targetKey);
      if (verify === null || sha256Of(verify) !== opts.targetBlobSha) {
        outcome = { status: "conflict_escalated", reason: "post-write verification failed" };
      } else {
        outcome = { status: "restored", toSha: opts.targetBlobSha };
      }
    } else if (opts.resolution === "trash") {
      const dest = await opts.trashFile(path);
      outcome = { status: "trashed", dest };
    } else {
      outcome = { status: "invalid_resolution" };
    }
    await this.writeWal({ kind: "result", sessionId: opts.sessionId, revertSeq: opts.revertSeq, outcomes: { [opts.targetKey]: outcome }, ts: Date.now() });
    return outcome;
  }
  /**
   * Crash recovery: find intents without matching results. Recovery REPLAYS the
   * recorded intent plan verbatim (never re-derives from a grown manifest).
   */
  async findUnsealedIntents() {
    await this.ready;
    const sealed = /* @__PURE__ */ new Set();
    for (const entry of this.wal) {
      if (entry.kind === "result") sealed.add(entry.revertSeq);
    }
    return this.wal.filter((e) => e.kind === "intent" && !sealed.has(e.revertSeq));
  }
  /** All SHAs referenced by WAL intents (for reachability GC). */
  liveShas() {
    const shas = /* @__PURE__ */ new Set();
    for (const entry of this.wal) {
      if (entry.kind !== "intent") continue;
      for (const p of Object.values(entry.plan ?? {})) {
        if (p.targetBlobSha !== null && p.targetBlobSha !== void 0) shas.add(p.targetBlobSha);
      }
    }
    return shas;
  }
};

// src/capture.ts
import { readFile as readFile4 } from "node:fs/promises";
var MUTATION_TOOLS = /* @__PURE__ */ new Set(["edit", "write"]);
async function capturePre(ctx, exec, pendingCaptures, maxSnapshotBytes) {
  if (!MUTATION_TOOLS.has(exec.name)) return;
  const args = exec.arguments;
  const filePath = args.file_path;
  if (typeof filePath !== "string" || filePath.length === 0) return;
  const fs = ctx.get("fs");
  if (fs?.resolve === void 0) return;
  const cwd = exec.agent?.session.header.cwd;
  const target = await fs.resolve(filePath, cwd !== void 0 ? { cwd } : void 0);
  let preExisted = false;
  let preStatus = "ok";
  let preBlobSha = null;
  let preBytes = null;
  try {
    const bytes = await readFile4(target.targetKey);
    preExisted = true;
    if (bytes.length > maxSnapshotBytes) {
      preStatus = "too-large";
    } else {
      preBlobSha = sha256Of(bytes);
      preBytes = bytes;
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      preExisted = false;
    } else {
      preStatus = "unreadable";
    }
  }
  pendingCaptures.set(exec.callId, {
    targetKey: target.targetKey,
    displayPath: target.displayPath,
    preExisted,
    preStatus,
    preBlobSha,
    preBytes
  });
}
async function capturePost(ctx, exec, result, pendingCaptures, manifestFor, blobStore) {
  if (!MUTATION_TOOLS.has(exec.name)) return;
  const pre = pendingCaptures.get(exec.callId);
  pendingCaptures.delete(exec.callId);
  if (pre === void 0) return;
  if (result.isError) return;
  const sessionId = exec.agent?.session.id;
  if (sessionId === void 0) return;
  const session = exec.agent?.session;
  if (session === void 0) return;
  if (pre.preBytes !== null && pre.preBlobSha !== null) {
    await blobStore.put(pre.preBytes);
  }
  let postStatus = "ok";
  let postBlobSha = null;
  try {
    const bytes = await readFile4(pre.targetKey);
    postBlobSha = sha256Of(bytes);
    await blobStore.put(bytes);
  } catch (err) {
    if (err.code === "ENOENT") {
      postStatus = "unreadable";
    } else {
      postStatus = "unreadable";
    }
  }
  let toolSeq = -1;
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i];
    if (e.type === "tool/call" && e.data.callId === exec.callId) {
      toolSeq = e.seq;
      break;
    }
  }
  if (toolSeq === -1) return;
  await manifestFor(sessionId).append({
    sessionId,
    toolSeq,
    callId: exec.callId,
    targetKey: pre.targetKey,
    displayPath: pre.displayPath,
    operation: pre.preExisted ? "update" : "create",
    preExisted: pre.preExisted,
    preStatus: pre.preStatus,
    preBlobSha: pre.preBlobSha,
    postStatus,
    postBlobSha,
    isInterleaved: false,
    timestamp: Date.now()
  });
}

// src/index.ts
var name = "enpoi-file-revert";
var inject = ["tools", "fs", "sessions", "sessionPersistence", "timer"];
var FILE_HISTORY_ROOT = join4(homedir(), ".dsh", "file-history");
var TRASH_ROOT = join4(homedir(), ".dsh", "trash");
var DIAG_LOG = join4(homedir(), ".dsh", "logs", "enpoi-file-revert.log");
function diag(msg) {
  try {
    mkdirSync(join4(homedir(), ".dsh", "logs"), { recursive: true });
    appendFileSync(DIAG_LOG, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch {
  }
}
var Config = Schema.object({
  /** Maximum snapshot size in bytes; larger files degrade to the unavailable-prompt path. */
  maxSnapshotBytes: Schema.number().default(10 * 1024 * 1024),
  /** Interval for the reachability GC sweep (ms). */
  gcIntervalMs: Schema.number().default(6 * 60 * 60 * 1e3),
  /** Age threshold for unreferenced blobs (ms). */
  gcTtlMs: Schema.number().default(30 * 24 * 60 * 60 * 1e3)
});
function apply(ctx, config) {
  diag(`apply: mounted (maxSnapshotBytes=${config.maxSnapshotBytes}, gcIntervalMs=${config.gcIntervalMs})`);
  const blobStore = new BlobStore(join4(FILE_HISTORY_ROOT, "blobs"));
  void blobStore.init();
  const pendingCaptures = /* @__PURE__ */ new Map();
  const sessionStates = /* @__PURE__ */ new Map();
  const manifests = /* @__PURE__ */ new Map();
  const executors = /* @__PURE__ */ new Map();
  function manifestFor(sessionId) {
    let m = manifests.get(sessionId);
    if (m === void 0) {
      m = new MutationManifest(join4(FILE_HISTORY_ROOT, sessionId, "manifest.jsonl"));
      void m.init();
      manifests.set(sessionId, m);
    }
    return m;
  }
  function executorFor(sessionId) {
    let e = executors.get(sessionId);
    if (e === void 0) {
      e = new RevertExecutor({
        blobStore,
        trashRoot: TRASH_ROOT,
        walFile: join4(FILE_HISTORY_ROOT, sessionId, "wal.jsonl")
      });
      void e.init();
      executors.set(sessionId, e);
    }
    return e;
  }
  function stateFor(sessionId) {
    let s = sessionStates.get(sessionId);
    if (s === void 0) {
      s = { boundary: null, flight: null };
      sessionStates.set(sessionId, s);
    }
    return s;
  }
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name === "edit" || exec.name === "write") {
      try {
        await capturePre(ctx, exec, pendingCaptures, config.maxSnapshotBytes);
      } catch (err) {
        diag(`pre-capture failed for ${exec.name}: ${String(err)}`);
      }
    }
    return next();
  });
  ctx.on("tools/post-execute", async (exec, result, next) => {
    if (exec.name === "edit" || exec.name === "write") {
      try {
        await capturePost(ctx, exec, result, pendingCaptures, manifestFor, blobStore);
      } catch (err) {
        diag(`post-capture failed for ${exec.name}: ${String(err)}`);
      }
    }
    return next();
  });
  ctx.on("session/event", (session, event) => {
    if (event.type !== "revert/state") return;
    const fromSeq = event.data.fromSeq;
    diag(`revert/state: session=${session.id} fromSeq=${String(fromSeq)} ctor=${session.constructor?.name} hasLog=${"log" in session} hasEvents=${"events" in session}`);
    const state = stateFor(session.id);
    state.boundary = fromSeq;
    if (state.flight !== null) {
      diag(`revert/state: session=${session.id} \u2014 flight in progress, skipping`);
      return;
    }
    state.flight = (async () => {
      try {
        await executeFileRevert(ctx, session, fromSeq, state, manifestFor, executorFor, blobStore);
      } catch (err) {
        diag(`revert execution FAILED for ${session.id}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
        try {
          appendIgnorable(session, "revert/file-result", {
            revertSeq: fromSeq ?? -1,
            outcomes: { _error: { status: "error", reason: err instanceof Error ? err.message : String(err) } }
          });
        } catch {
        }
      } finally {
        state.flight = null;
      }
    })();
  });
  const onAny = ctx.on;
  onAny("file-revert/resolve", async (...args) => {
    const request = args[0];
    try {
      const outcome = await applyConflictResolution(ctx, request, executorFor);
      return { accepted: true, ...outcome };
    } catch (err) {
      return { accepted: false, reason: String(err) };
    }
  });
  void recoverUnsealedIntents(ctx, executorFor);
  const timer = ctx.get("timer");
  if (timer?.setInterval !== void 0) {
    timer.setInterval(() => {
      void runGc(manifests, executors, blobStore, config.gcTtlMs).catch((err) => {
        diag(`GC sweep failed: ${String(err)}`);
      });
    }, config.gcIntervalMs);
  }
  onAny("dispose", () => {
    pendingCaptures.clear();
    sessionStates.clear();
  });
}
function appendIgnorable(session, type, data) {
  const s = session;
  s.append(type, data, { ignorable: true });
}
async function executeFileRevert(ctx, session, fromSeq, state, manifestFor, executorFor, blobStore) {
  const manifest = manifestFor(session.id);
  const executor = executorFor(session.id);
  const spanStart = fromSeq ?? state.boundary ?? 0;
  const aggregated = manifest.aggregateSpan(spanStart);
  diag(`executeFileRevert: session=${session.id} fromSeq=${String(fromSeq)} spanStart=${spanStart} aggregated=${aggregated.size} records=${manifest.records.length}`);
  if (aggregated.size === 0) return;
  const activeChildren = await findActiveChildren(ctx, session.id);
  if (activeChildren.length > 0) {
    appendIgnorable(session, "revert/file-result", {
      revertSeq: fromSeq ?? -1,
      outcomes: {
        _guard: { status: "refused", reason: `active subagent fibers: ${activeChildren.join(", ")}` }
      }
    });
    diag(`file revert refused for ${session.id} \u2014 active children ${activeChildren.join(", ")}`);
    return;
  }
  const plan = /* @__PURE__ */ new Map();
  const conflicts = [];
  for (const [targetKey, entry] of aggregated) {
    const target = manifest.resolveRestoreTarget(targetKey, fromSeq);
    const current = await readDiskBytes(ctx, targetKey);
    const currentSha = current === null ? null : sha256Hex(current);
    const evalResult = evaluateBoundary(entry, target, currentSha);
    plan.set(targetKey, {
      entry,
      state: evalResult.state,
      action: evalResult.action,
      targetBlobSha: evalResult.targetBlobSha,
      expectedDiskSha: evalResult.expectedDiskSha,
      reason: evalResult.reason
    });
    if (evalResult.state === STATE.CONFLICT || evalResult.state === STATE.MISSING || evalResult.state === STATE.UNAVAILABLE) {
      conflicts.push({
        targetKey,
        displayPath: entry.finalPost.displayPath,
        state: evalResult.state,
        reason: evalResult.reason ?? "",
        preSha: entry.initialPre.preBlobSha,
        postSha: entry.finalPost.postBlobSha,
        currentSha
      });
    }
  }
  appendIgnorable(session, "revert/file-intent", {
    revertSeq: fromSeq ?? -1,
    plan: Object.fromEntries([...plan].map(([key, p]) => [key, { action: p.action, targetBlobSha: p.targetBlobSha, expectedDiskSha: p.expectedDiskSha }]))
  });
  const typedPlan = plan;
  const { outcomes } = await executor.execute({
    sessionId: session.id,
    revertSeq: fromSeq ?? -1,
    plan: typedPlan,
    resolvePath: async (key) => key,
    readDisk: async (key) => readDiskBytes(ctx, key),
    writeDisk: async (path, bytes) => executor.atomicWrite(path, bytes),
    trashFile: async (path) => executor.trash(path, session.id)
  });
  for (const c of conflicts) {
    appendIgnorable(session, "revert/file-conflict", {
      conflictId: randomUUID2(),
      targetKey: c.targetKey,
      displayPath: c.displayPath,
      state: c.state,
      reason: c.reason,
      preSha: c.preSha,
      postSha: c.postSha,
      currentSha: c.currentSha
    });
  }
  appendIgnorable(session, "revert/file-result", { revertSeq: fromSeq ?? -1, outcomes });
}
async function applyConflictResolution(ctx, request, executorFor) {
  const executor = executorFor(request.sessionId);
  const sessions = ctx.get("sessions");
  const session = sessions?.get?.(request.sessionId);
  if (session === void 0) throw new Error("session not found");
  const conflictEvent = [...session.events].reverse().find((e) => e.type === "revert/file-conflict" && e.data.conflictId === request.conflictId);
  if (conflictEvent === void 0) throw new Error(`conflict ${request.conflictId} not found`);
  const conflict = conflictEvent.data;
  let resolution = request.resolution;
  let targetBlobSha = null;
  if (resolution === "restore") {
    if (conflict.preSha !== null) {
      targetBlobSha = conflict.preSha;
    } else {
      resolution = "trash";
    }
  } else if (resolution === "recreate") {
    targetBlobSha = conflict.preSha ?? conflict.postSha;
  }
  const outcome = await executor.applyResolution({
    sessionId: request.sessionId,
    revertSeq: -1,
    targetKey: conflict.targetKey,
    resolution,
    targetBlobSha,
    expectedDiskSha: conflict.currentSha,
    resolvePath: async (key) => key,
    readDisk: async (key) => readDiskBytes(ctx, key),
    writeDisk: async (path, bytes) => executor.atomicWrite(path, bytes),
    trashFile: async (path) => executor.trash(path, request.sessionId)
  });
  appendIgnorable(session, "revert/file-result", {
    revertSeq: -1,
    outcomes: { [conflict.targetKey]: outcome }
  });
  return { outcome };
}
async function recoverUnsealedIntents(ctx, executorFor) {
  try {
    const { readdir: readdir2 } = await import("node:fs/promises");
    const sessions = await readdir2(FILE_HISTORY_ROOT, { withFileTypes: true });
    for (const entry of sessions) {
      if (!entry.isDirectory()) continue;
      const executor = executorFor(entry.name);
      const unsealed = await executor.findUnsealedIntents();
      for (const intent of unsealed) {
        diag(`recovering unsealed intent ${intent.revertSeq} for ${entry.name}`);
        const plan = new Map(
          Object.entries(intent.plan).map(([key, p]) => {
            const rec = p;
            return [key, { action: rec.action, targetBlobSha: rec.targetBlobSha, expectedDiskSha: rec.expectedDiskSha }];
          })
        );
        await executor.execute({
          sessionId: entry.name,
          revertSeq: intent.revertSeq,
          plan,
          resolvePath: async (key) => key,
          readDisk: async (key) => readDiskBytes(ctx, key),
          writeDisk: async (path, bytes) => executor.atomicWrite(path, bytes),
          trashFile: async (path) => executor.trash(path, entry.name)
        });
      }
    }
  } catch (err) {
    diag(`recovery scan failed: ${String(err)}`);
  }
}
async function runGc(manifests, executors, blobStore, ttlMs) {
  const live = /* @__PURE__ */ new Set();
  const { readdir: readdir2, readFile: readFile5 } = await import("node:fs/promises");
  const sessions = await readdir2(FILE_HISTORY_ROOT, { withFileTypes: true });
  for (const entry of sessions) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile5(join4(FILE_HISTORY_ROOT, entry.name, "manifest.jsonl"), "utf8");
      for (const line of raw.split("\n")) {
        if (line.length === 0) continue;
        try {
          const rec = JSON.parse(line);
          if (rec.preBlobSha) live.add(rec.preBlobSha);
          if (rec.postBlobSha) live.add(rec.postBlobSha);
        } catch {
        }
      }
    } catch {
    }
  }
  for (const e of executors.values()) for (const sha of e.liveShas()) live.add(sha);
  await blobStore.gc(live, ttlMs);
}
async function findActiveChildren(ctx, parentId) {
  const sessions = ctx.get("sessions");
  const parent = sessions?.get?.(parentId);
  if (parent === void 0) return [];
  const children = [];
  for (const event of parent.events) {
    const e = event;
    if (e.type !== "subagent/descriptor") continue;
    if (e.data.childSessionId !== void 0 && ctx.agents.get(e.data.childSessionId) !== void 0) {
      children.push(e.data.childSessionId);
    }
  }
  return children;
}
async function readDiskBytes(ctx, targetKey) {
  const { readFile: readFile5 } = await import("node:fs/promises");
  try {
    return await readFile5(targetKey);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
function sha256Hex(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
export {
  Config,
  apply,
  inject,
  name
};
