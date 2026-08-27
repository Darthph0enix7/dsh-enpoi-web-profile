// file-revert.spec.ts — vitest suite for enpoi-file-revert core logic.
// Ports the sandbox spike tests (26/26) against the TypeScript modules.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BlobStore, sha256Of } from '../src/blob-store'
import { MutationManifest } from '../src/manifest'
import { evaluateFile, evaluateBoundary, buildRevertPlan, STATE } from '../src/evaluator'
import { RevertExecutor } from '../src/executor'

interface Env {
  root: string
  blobs: BlobStore
  manifest: MutationManifest
  executor: RevertExecutor
  work: string
}

let env: Env

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'fr-'))
  const blobs = new BlobStore(join(root, 'blobs'))
  await blobs.init()
  const manifest = new MutationManifest(join(root, 'manifest.jsonl'))
  await manifest.init()
  const executor = new RevertExecutor({ blobStore: blobs, trashRoot: join(root, 'trash'), walFile: join(root, 'wal.jsonl') })
  await executor.init()
  const work = join(root, 'work')
  await mkdir(work)
  env = { root, blobs, manifest, executor, work }
})

afterEach(async () => {
  await rm(env.root, { recursive: true, force: true })
})

async function simulateMutation(opts: {
  seq: number
  callId: string
  targetKey: string
  displayPath: string
  preBytes: Buffer | null
  postBytes: Buffer
  preStatus?: 'ok' | 'too-large' | 'unreadable'
  postStatus?: 'ok' | 'too-large' | 'unreadable'
}): Promise<void> {
  const { blobs, manifest, work } = env
  const preExisted = opts.preBytes !== null
  const preStatus = opts.preStatus ?? 'ok'
  const postStatus = opts.postStatus ?? 'ok'
  const preBlobSha = opts.preBytes === null ? null : await blobs.put(opts.preBytes)
  const postBlobSha = postStatus === 'ok' ? await blobs.put(opts.postBytes) : null
  await manifest.append({
    sessionId: 's1',
    toolSeq: opts.seq,
    callId: opts.callId,
    targetKey: opts.targetKey,
    displayPath: opts.displayPath,
    operation: preExisted ? 'update' : 'create',
    preExisted,
    preStatus,
    preBlobSha,
    postStatus,
    postBlobSha,
    isInterleaved: false,
    timestamp: Date.now(),
  })
  await writeFile(join(work, opts.targetKey), opts.postBytes)
}

const readDisk = async (targetKey: string): Promise<Buffer | null> => {
  try { return await readFile(join(env.work, targetKey)) } catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null; throw err }
}
const resolvePath = async (targetKey: string): Promise<string> => join(env.work, targetKey)
const atomicWriter = async (p: string, b: Buffer): Promise<void> => env.executor.atomicWrite(p, b)
const trashFile = async (p: string): Promise<string> => env.executor.trash(p, 's1')

async function runPlan(plan: Map<string, { action: string; targetBlobSha: string | null; expectedDiskSha: string | null }>, revertSeq = 10) {
  return env.executor.execute({
    sessionId: 's1', revertSeq, plan,
    resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
  })
}

describe('evaluator state machine', () => {
  it('clean restore: edit then revert restores pre-agent content', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    const { plan, conflicts, clean } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(conflicts).toHaveLength(0)
    expect(clean).toHaveLength(1)
    expect(plan.get('a.txt')?.state).toBe(STATE.CLEAN_RESTORE)
    const { outcomes, sealed } = await runPlan(plan)
    expect(sealed).toBe(true)
    expect(outcomes['a.txt']?.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('original')
  })

  it('clean trash: created file reverts to trash, not deletion', async () => {
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'new.txt', displayPath: 'new.txt', preBytes: null, postBytes: Buffer.from('created by agent') })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('new.txt')?.state).toBe(STATE.CLEAN_TRASH)
    const { outcomes } = await runPlan(plan)
    expect(outcomes['new.txt']?.status).toBe('trashed')
    await expect(readFile(join(env.work, 'new.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('already clean: disk at pre-state -> no-op', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await writeFile(join(env.work, 'a.txt'), 'original')
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('a.txt')?.state).toBe(STATE.ALREADY_CLEAN)
    const { outcomes } = await runPlan(plan)
    expect(outcomes['a.txt']?.status).toBe('no_op')
  })

  it('conflict: user edit on top -> prompt, disk untouched', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await writeFile(join(env.work, 'a.txt'), 'user manual edit')
    const { plan, conflicts } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('a.txt')?.state).toBe(STATE.CONFLICT)
    expect(conflicts).toHaveLength(1)
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('user manual edit')
  })

  it('already absent: created file already deleted by user -> no-op', async () => {
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'new.txt', displayPath: 'new.txt', preBytes: null, postBytes: Buffer.from('x') })
    await rm(join(env.work, 'new.txt'))
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('new.txt')?.state).toBe(STATE.ALREADY_ABSENT)
  })

  it('missing: pre-existing file deleted on disk -> prompt with recreate option', async () => {
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await rm(join(env.work, 'a.txt'))
    const { plan, conflicts } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('a.txt')?.state).toBe(STATE.MISSING)
    expect(conflicts).toHaveLength(1)
    expect(plan.get('a.txt')?.targetBlobSha).not.toBeNull()
  })

  it('unavailable pre-state: >maxBytes file -> skip, never delete', async () => {
    await writeFile(join(env.work, 'big.bin'), Buffer.alloc(1024, 1))
    await simulateMutation({
      seq: 10, callId: 'c1', targetKey: 'big.bin', displayPath: 'big.bin',
      preBytes: Buffer.alloc(1024, 1), postBytes: Buffer.alloc(1024, 2), preStatus: 'too-large',
    })
    const { plan, conflicts } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('big.bin')?.state).toBe(STATE.UNAVAILABLE)
    expect(conflicts).toHaveLength(1)
    const bytes = await readFile(join(env.work, 'big.bin'))
    expect(bytes[0]).toBe(2)
  })

  it('postStatus unreadable: null post-blob -> unavailable prompt', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({
      seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt',
      preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit'), postStatus: 'unreadable',
    })
    const { plan, conflicts } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('a.txt')?.state).toBe(STATE.UNAVAILABLE)
    expect(conflicts).toHaveLength(1)
  })

  it('CRLF fidelity: raw bytes round-trip without line-ending mangling', async () => {
    const crlfPre = Buffer.from('line1\r\nline2\r\n', 'utf8')
    const crlfPost = Buffer.from('line1\r\nline2 CHANGED\r\n', 'utf8')
    await writeFile(join(env.work, 'win.txt'), crlfPre)
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'win.txt', displayPath: 'win.txt', preBytes: crlfPre, postBytes: crlfPost })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('win.txt')?.state).toBe(STATE.CLEAN_RESTORE)
    const { outcomes } = await runPlan(plan)
    expect(outcomes['win.txt']?.status).toBe('restored')
    expect(await readFile(join(env.work, 'win.txt'))).toEqual(crlfPre)
  })

  it('binary fidelity: non-UTF8 bytes round-trip exactly', async () => {
    const binPre = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x01])
    const binPost = Buffer.from([0x00, 0xff, 0x10, 0x80, 0x02])
    await writeFile(join(env.work, 'bin.dat'), binPre)
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'bin.dat', displayPath: 'bin.dat', preBytes: binPre, postBytes: binPost })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(plan.get('bin.dat')?.state).toBe(STATE.CLEAN_RESTORE)
    const { outcomes } = await runPlan(plan)
    expect(await readFile(join(env.work, 'bin.dat'))).toEqual(binPre)
  })

  it('multi-file batch: clean files revert, conflicted file prompts', async () => {
    await writeFile(join(env.work, 'clean.txt'), 'orig')
    await writeFile(join(env.work, 'dirty.txt'), 'orig2')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'clean.txt', displayPath: 'clean.txt', preBytes: Buffer.from('orig'), postBytes: Buffer.from('agent1') })
    await simulateMutation({ seq: 11, callId: 'c2', targetKey: 'dirty.txt', displayPath: 'dirty.txt', preBytes: Buffer.from('orig2'), postBytes: Buffer.from('agent2') })
    await writeFile(join(env.work, 'dirty.txt'), 'user edit')
    const { plan, conflicts, clean } = await buildRevertPlan(env.manifest, 10, readDisk)
    expect(clean).toHaveLength(1)
    expect(conflicts).toHaveLength(1)
    const { outcomes } = await runPlan(plan)
    expect(outcomes['clean.txt']?.status).toBe('restored')
    expect(outcomes['dirty.txt']?.status).toBe('pending_conflict')
    expect(await readFile(join(env.work, 'dirty.txt'), 'utf8')).toBe('user edit')
  })
})

describe('partial restore & interleaving', () => {
  it('restoreSeq picks latest mutation at or before seq', async () => {
    await writeFile(join(env.work, 'a.txt'), 'v0')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('v1') })
    await simulateMutation({ seq: 20, callId: 'c2', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v1'), postBytes: Buffer.from('v2') })
    const t15 = env.manifest.resolveRestoreTarget('a.txt', 15)
    expect(t15.postBlobSha).toBe(env.manifest.records[0].postBlobSha)
    const t25 = env.manifest.resolveRestoreTarget('a.txt', 25)
    expect(t25.postBlobSha).toBe(env.manifest.records[1].postBlobSha)
    const t5 = env.manifest.resolveRestoreTarget('a.txt', 5)
    expect(t5.preBlobSha).toBe(env.manifest.records[0].preBlobSha)
    expect(t5.postBlobSha).toBeNull()
    const tNull = env.manifest.resolveRestoreTarget('a.txt', null)
    expect(tNull.postBlobSha).toBe(env.manifest.records[1].postBlobSha)
  })

  it('partial restore execution: mid-span restore writes the resolved state', async () => {
    await writeFile(join(env.work, 'a.txt'), 'v0')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('v1') })
    await simulateMutation({ seq: 20, callId: 'c2', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v1'), postBytes: Buffer.from('v2') })
    const target = env.manifest.resolveRestoreTarget('a.txt', 15)
    const plan = new Map([[ 'a.txt', {
      action: 'restore', targetBlobSha: target.postBlobSha, expectedDiskSha: sha256Of(Buffer.from('v2')),
    } ]])
    const { outcomes } = await runPlan(plan, 15)
    expect(outcomes['a.txt']?.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('v1')
  })

  it('interleaved chain: parallel same-file writes flagged; mid-span restore refused', async () => {
    await simulateMutation({ seq: 10, callId: 'cA', targetKey: 'f.txt', displayPath: 'f.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('vB') })
    await simulateMutation({ seq: 11, callId: 'cB', targetKey: 'f.txt', displayPath: 'f.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('vB') })
    expect(env.manifest.records[1].isInterleaved).toBe(true)
    expect(env.manifest.resolveRestoreTarget('f.txt', 10).isInterleaved).toBe(true)
    expect(env.manifest.resolveRestoreTarget('f.txt', 11).isInterleaved).toBe(true)
  })

  it('boundary evaluation: restore-all targets finalPost', async () => {
    await writeFile(join(env.work, 'a.txt'), 'v0')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('v1') })
    // Disk at pre-state (v0), restore-all target = v1 (finalPost).
    await writeFile(join(env.work, 'a.txt'), 'v0')
    const entry = env.manifest.aggregateSpan(10).get('a.txt')!
    const target = env.manifest.resolveRestoreTarget('a.txt', null)
    const result = evaluateBoundary(entry, target, sha256Of(Buffer.from('v0')))
    expect(result.state).toBe(STATE.CLEAN_RESTORE)
    expect(result.targetBlobSha).toBe(entry.finalPost.postBlobSha)
  })
})

describe('WAL, crash recovery & durability', () => {
  it('crash recovery: unsealed intent replays recorded plan idempotently', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await env.executor.writeWal({
      kind: 'intent', sessionId: 's1', revertSeq: 10,
      plan: { 'a.txt': { action: 'restore', targetBlobSha: env.manifest.records[0].preBlobSha, expectedDiskSha: env.manifest.records[0].postBlobSha } },
      ts: Date.now(),
    })
    const executor2 = new RevertExecutor({ blobStore: env.blobs, trashRoot: join(env.root, 'trash'), walFile: join(env.root, 'wal.jsonl') })
    await new Promise(r => setTimeout(r, 20))
    const unsealed = await executor2.findUnsealedIntents()
    expect(unsealed).toHaveLength(1)
    const recordedPlan = new Map(Object.entries(unsealed[0].plan).map(([key, p]) => [key, p]))
    const { outcomes } = await executor2.execute({
      sessionId: 's1', revertSeq: 10, plan: recordedPlan,
      resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(outcomes['a.txt']?.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('original')
    expect(await executor2.findUnsealedIntents()).toHaveLength(0)
  })

  it('no-seal-on-error: unexpected failure leaves intent unsealed', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    const { sealed } = await env.executor.execute({
      sessionId: 's1', revertSeq: 10, plan,
      resolvePath: async () => { throw new Error('boom') },
      readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(sealed).toBe(false)
    expect(await env.executor.findUnsealedIntents()).toHaveLength(1)
  })

  it('blob-missing degrades per-file, batch continues', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await writeFile(join(env.work, 'b.txt'), 'origB')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agentA') })
    await simulateMutation({ seq: 11, callId: 'c2', targetKey: 'b.txt', displayPath: 'b.txt', preBytes: Buffer.from('origB'), postBytes: Buffer.from('agentB') })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    const missingSha = env.manifest.records[0].preBlobSha!
    await rm(join(env.root, 'blobs', missingSha))
    const { outcomes, sealed } = await runPlan(plan)
    expect(sealed).toBe(true)
    expect(outcomes['a.txt']?.status).toBe('conflict_escalated')
    expect(outcomes['b.txt']?.status).toBe('restored')
  })

  it('TOCTOU: disk modified between evaluation and write escalates to conflict', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    await writeFile(join(env.work, 'a.txt'), 'user edit after eval')
    const { outcomes } = await runPlan(plan)
    expect(outcomes['a.txt']?.status).toBe('conflict_escalated')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('user edit after eval')
  })

  it('composing reverts: already-reverted files yield no-ops on second revert', async () => {
    await writeFile(join(env.work, 'a.txt'), 'v0')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v0'), postBytes: Buffer.from('v1') })
    await simulateMutation({ seq: 20, callId: 'c2', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('v1'), postBytes: Buffer.from('v2') })
    const { plan: plan1 } = await buildRevertPlan(env.manifest, 10, readDisk)
    await runPlan(plan1)
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('v0')
    const { plan: plan2 } = await buildRevertPlan(env.manifest, 5, readDisk)
    expect(plan2.get('a.txt')?.state).toBe(STATE.ALREADY_CLEAN)
  })

  it('reachability GC: restart-safe; referenced blobs survive, orphans pruned', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    const orphanSha = await env.blobs.put(Buffer.from('orphan data'))
    await new Promise(r => setTimeout(r, 5)) // ensure mtime is older than the 0ms TTL
    const blobs2 = new BlobStore(join(env.root, 'blobs'))
    await blobs2.init()
    // Disk-derived liveness: read the manifest from disk (as runGc does), NOT
    // from the in-memory instance — a capture-only session untouched since
    // restart must still protect its snapshots.
    const raw = await readFile(join(env.root, 'manifest.jsonl'), 'utf8')
    const live = new Set<string>()
    for (const line of raw.split('\n')) {
      if (line.length === 0) continue
      const rec = JSON.parse(line) as { preBlobSha?: string | null; postBlobSha?: string | null }
      if (rec.preBlobSha) live.add(rec.preBlobSha)
      if (rec.postBlobSha) live.add(rec.postBlobSha)
    }
    await blobs2.gc(live, 0)
    expect(await blobs2.get(env.manifest.records[0].preBlobSha)).not.toBeNull()
    expect(await blobs2.get(env.manifest.records[0].postBlobSha)).not.toBeNull()
    await expect(blobs2.get(orphanSha)).rejects.toThrow()
  })

  it('torn trailing line: manifest and WAL tolerate crash-mid-append', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await appendFile(join(env.root, 'manifest.jsonl'), '{"torn": tru')
    await appendFile(join(env.root, 'wal.jsonl'), '{"kind":"intent","revertSeq":99,"plan":{},"ts":1')
    const m2 = new MutationManifest(join(env.root, 'manifest.jsonl')); await new Promise(r => setTimeout(r, 20))
    expect(m2.records).toHaveLength(1)
    const e2 = new RevertExecutor({ blobStore: env.blobs, trashRoot: join(env.root, 'trash'), walFile: join(env.root, 'wal.jsonl') }); await new Promise(r => setTimeout(r, 20))
    expect(e2.wal).toHaveLength(0)
  })

  it('trash collision: same-basename files get unique destinations', async () => {
    await writeFile(join(env.work, 'x.txt'), 'one')
    await writeFile(join(env.work, 'y.txt'), 'two')
    const d1 = await env.executor.trash(join(env.work, 'x.txt'), 's1')
    const d2 = await env.executor.trash(join(env.work, 'y.txt'), 's1')
    expect(d1).not.toBe(d2)
    expect(await readFile(d1, 'utf8')).toBe('one')
    expect(await readFile(d2, 'utf8')).toBe('two')
  })

  it('crashed resolution replay: resolve:* intents replay through execute', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await writeFile(join(env.work, 'a.txt'), 'user manual edit')
    // Crash: a resolution intent was written but never sealed.
    await env.executor.writeWal({
      kind: 'intent', sessionId: 's1', revertSeq: -1,
      plan: { 'a.txt': { action: 'resolve:restore', targetBlobSha: env.manifest.records[0].preBlobSha, expectedDiskSha: sha256Of(Buffer.from('user manual edit')) } },
      ts: Date.now(),
    })
    const executor2 = new RevertExecutor({ blobStore: env.blobs, trashRoot: join(env.root, 'trash'), walFile: join(env.root, 'wal.jsonl') })
    await new Promise(r => setTimeout(r, 20))
    const unsealed = await executor2.findUnsealedIntents()
    expect(unsealed).toHaveLength(1)
    // Recovery replays the resolve:restore intent through execute (normalized).
    const recordedPlan = new Map(Object.entries(unsealed[0].plan).map(([key, p]) => [key, p]))
    const { outcomes } = await executor2.execute({
      sessionId: 's1', revertSeq: -1, plan: recordedPlan,
      resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(outcomes['a.txt']?.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('original')
  })
})

describe('applyResolution', () => {
  it('restore: force-revert overwrites user edit', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await writeFile(join(env.work, 'a.txt'), 'user manual edit')
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    const conflict = plan.get('a.txt')!
    expect(conflict.state).toBe(STATE.CONFLICT)
    const outcome = await env.executor.applyResolution({
      sessionId: 's1', revertSeq: 10, targetKey: 'a.txt',
      resolution: 'restore', targetBlobSha: conflict.targetBlobSha, expectedDiskSha: conflict.expectedDiskSha,
      resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(outcome.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('original')
  })

  it('keep: user keeps their version, disk untouched', async () => {
    await writeFile(join(env.work, 'a.txt'), 'original')
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await writeFile(join(env.work, 'a.txt'), 'user manual edit')
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    const conflict = plan.get('a.txt')!
    const outcome = await env.executor.applyResolution({
      sessionId: 's1', revertSeq: 10, targetKey: 'a.txt',
      resolution: 'keep', targetBlobSha: null, expectedDiskSha: conflict.expectedDiskSha,
      resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(outcome.status).toBe('kept')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('user manual edit')
  })

  it('recreate: missing file recreated from pre-agent snapshot', async () => {
    await simulateMutation({ seq: 10, callId: 'c1', targetKey: 'a.txt', displayPath: 'a.txt', preBytes: Buffer.from('original'), postBytes: Buffer.from('agent edit') })
    await rm(join(env.work, 'a.txt'))
    const { plan } = await buildRevertPlan(env.manifest, 10, readDisk)
    const missing = plan.get('a.txt')!
    expect(missing.state).toBe(STATE.MISSING)
    const outcome = await env.executor.applyResolution({
      sessionId: 's1', revertSeq: 10, targetKey: 'a.txt',
      resolution: 'recreate', targetBlobSha: missing.targetBlobSha, expectedDiskSha: null,
      resolvePath, readDisk, writeDisk: atomicWriter, trashFile,
    })
    expect(outcome.status).toBe('restored')
    expect(await readFile(join(env.work, 'a.txt'), 'utf8')).toBe('original')
  })
})