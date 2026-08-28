/**
 * Append-only FileMutationRecord JSONL store.
 * Tolerates a torn trailing line (crash mid-append). postBlobSha is nullable
 * when postStatus !== 'ok'.
 */

import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FileMutationRecord {
  sessionId: string
  toolSeq: number
  callId: string
  targetKey: string
  displayPath: string
  operation: 'create' | 'update'
  preExisted: boolean
  preStatus: 'ok' | 'too-large' | 'unreadable'
  preBlobSha: string | null
  postStatus: 'ok' | 'too-large' | 'unreadable'
  postBlobSha: string | null
  isInterleaved: boolean
  timestamp: number
}

export interface SpanEntry {
  initialPre: FileMutationRecord
  finalPost: FileMutationRecord
  records: FileMutationRecord[]
  sessionCreated?: boolean
}

export class MutationManifest {
  records: FileMutationRecord[] = []
  private ready: Promise<void>

  constructor(private readonly filePath: string) {
    // Serialize init vs append: append awaits ready so a slow init read can
    // never clobber an in-flight append's in-memory push (the ENOENT catch
    // would otherwise wipe records appended before init settled).
    this.ready = this.init()
  }

  private async init(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const lines = raw.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.length === 0) continue
        try {
          this.records.push(JSON.parse(line) as FileMutationRecord)
        } catch {
          // Torn trailing line from a crash mid-append: drop it.
          // Corruption anywhere else hard-fails.
          if (i !== lines.length - 1) throw new Error(`corrupt manifest line ${i + 1}`)
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async append(record: FileMutationRecord): Promise<FileMutationRecord> {
    await this.ready
    const prior = this.lastFor(record.targetKey)
    if (prior !== undefined && prior.postBlobSha !== record.preBlobSha) {
      record.isInterleaved = true
    }
    this.records.push(record)
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await appendFile(this.filePath, JSON.stringify(record) + '\n', 'utf8')
    return record
  }

  lastFor(targetKey: string): FileMutationRecord | undefined {
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i].targetKey === targetKey) return this.records[i]
    }
    return undefined
  }

  inSpan(fromSeq: number): FileMutationRecord[] {
    return this.records.filter(r => r.toolSeq >= fromSeq)
  }

  upTo(seq: number): FileMutationRecord[] {
    return this.records.filter(r => r.toolSeq <= seq)
  }

  isSessionCreated(targetKey: string): boolean {
    const recs = this.records.filter(r => r.targetKey === targetKey)
    if (recs.length === 0) return false
    const earliest = recs.reduce((a, b) => (b.toolSeq < a.toolSeq ? b : a))
    return !earliest.preExisted
  }

  aggregateSpan(fromSeq: number): Map<string, SpanEntry> {
    const span = this.inSpan(fromSeq)
    const byKey = new Map<string, SpanEntry>()
    for (const rec of span) {
      let entry = byKey.get(rec.targetKey)
      if (entry === undefined) {
        entry = {
          initialPre: rec,
          finalPost: rec,
          records: [],
          sessionCreated: this.isSessionCreated(rec.targetKey),
        }
        byKey.set(rec.targetKey, entry)
      }
      entry.records.push(rec)
      if (rec.toolSeq < entry.initialPre.toolSeq) entry.initialPre = rec
      if (rec.toolSeq > entry.finalPost.toolSeq) entry.finalPost = rec
    }
    return byKey
  }

  /**
   * Resolve the target state for a boundary: latest mutation ≤ seq (post),
   * falling back to the initial pre-state; `null` boundary resolves to the
   * final post-state (restore-all).
   */
  resolveRestoreTarget(targetKey: string, restoreSeq: number | null): {
    preExisted: boolean
    preStatus: string
    preBlobSha: string | null
    postBlobSha: string | null
    isInterleaved: boolean
    sessionCreated: boolean
  } {
    const sessionCreated = this.isSessionCreated(targetKey)
    if (restoreSeq === null) {
      // Restore-all: target = final post-state of the whole span.
      const spanRecs = this.records.filter(r => r.targetKey === targetKey)
      if (spanRecs.length === 0) {
        return { preExisted: false, preStatus: 'ok', preBlobSha: null, postBlobSha: null, isInterleaved: false, sessionCreated }
      }
      const earliest = spanRecs.reduce((a, b) => (b.toolSeq < a.toolSeq ? b : a))
      const latest = spanRecs.reduce((a, b) => (b.toolSeq > a.toolSeq ? b : a))
      return {
        preExisted: earliest.preExisted,
        preStatus: earliest.preStatus,
        preBlobSha: earliest.preBlobSha,
        postBlobSha: latest.postBlobSha,
        isInterleaved: spanRecs.some(r => r.isInterleaved),
        sessionCreated,
      }
    }
    const recs = this.upTo(restoreSeq).filter(r => r.targetKey === targetKey)
    if (recs.length === 0) {
      const spanRecs = this.records.filter(r => r.targetKey === targetKey)
      if (spanRecs.length === 0) {
        return { preExisted: false, preStatus: 'ok', preBlobSha: null, postBlobSha: null, isInterleaved: false, sessionCreated }
      }
      const earliest = spanRecs.reduce((a, b) => (b.toolSeq < a.toolSeq ? b : a))
      return {
        preExisted: earliest.preExisted,
        preStatus: earliest.preStatus,
        preBlobSha: earliest.preBlobSha,
        postBlobSha: null,
        isInterleaved: false,
        sessionCreated,
      }
    }
    const earliestSpan = this.records.filter(r => r.targetKey === targetKey).reduce((a, b) => (b.toolSeq < a.toolSeq ? b : a))
    const latest = recs.reduce((a, b) => (b.toolSeq > a.toolSeq ? b : a))
    // Interleaving guard: refuse mid-span restore points inside the interleaved
    // region — both the boundary record and its successor are unreliable.
    const chainInterleaved = recs.some(r => r.isInterleaved)
      || this.records.some(r => r.targetKey === targetKey && r.toolSeq > restoreSeq && r.isInterleaved)
    return {
      preExisted: earliestSpan.preExisted,
      preStatus: earliestSpan.preStatus,
      preBlobSha: earliestSpan.preBlobSha,
      postBlobSha: latest.postBlobSha,
      isInterleaved: chainInterleaved,
      sessionCreated,
    }
  }

  /** All SHAs referenced by live records (for reachability GC). */
  liveShas(): Set<string> {
    const shas = new Set<string>()
    for (const r of this.records) {
      if (r.preBlobSha !== null) shas.add(r.preBlobSha)
      if (r.postBlobSha !== null) shas.add(r.postBlobSha)
    }
    return shas
  }
}