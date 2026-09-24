import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendAskNotice,
  askLabel,
  askSummary,
  defaultNoticesPath,
  localDecisionToPeerAnswer,
} from '../src/asks.ts'
import { contentText, recordAssistantText, recordRpcId, recordTerminal, recordTurn } from '../src/follow.ts'

const event = (type: string, data: unknown) => ({ seq: 1, time: 1, type, data })

describe('follow record readers', () => {
  it('reads the prompt rpcId from a user/message source', () => {
    expect(recordRpcId(event('user/message', { source: { kind: 'user', rpcId: 'peer-bridge-1' } }))).toBe('peer-bridge-1')
    expect(recordRpcId(event('user/message', { source: { kind: 'plugin', plugin: 'x' } }))).toBeUndefined()
    expect(recordRpcId(event('assistant/message', {}))).toBeUndefined()
  })

  it('extracts assistant text blocks only', () => {
    expect(recordAssistantText(event('assistant/message', {
      turn: 2,
      message: { content: [{ type: 'text', text: 'one' }, { type: 'reasoning', text: 'hidden' }, { type: 'text', text: 'two' }] },
    }))).toBe('one\ntwo')
    expect(contentText(undefined)).toBe('')
  })

  it('parses turn terminals with structured errors', () => {
    expect(recordTerminal(event('turn/end', { turn: 3, reason: { kind: 'completed' } }))).toEqual({ turn: 3, reason: 'completed' })
    expect(recordTerminal(event('turn/end', {
      turn: 4,
      reason: { kind: 'error', error: { code: 'insufficient-balance', message: 'no credit', provider: 'p', model: 'm' } },
    }))).toMatchObject({ turn: 4, reason: 'error', error: { code: 'insufficient-balance' } })
    expect(recordTerminal(event('assistant/message', { turn: 1 }))).toBeUndefined()
    expect(recordTurn(event('turn/end', { turn: 9, reason: {} }))).toBe(9)
  })
})

describe('ask surfacing helpers', () => {
  it('maps local decisions onto the peer answer vocabulary', () => {
    expect(localDecisionToPeerAnswer('allowed-once').outcome).toBe('allowed-once')
    expect(localDecisionToPeerAnswer('rejected').outcome).toBe('rejected')
    expect(localDecisionToPeerAnswer('cancelled').outcome).toBeUndefined()
    expect(localDecisionToPeerAnswer('unavailable').outcome).toBeUndefined()
    expect(localDecisionToPeerAnswer('unsurfaced').note).toContain('peer_answer')
  })

  it('labels and summarizes asks', () => {
    const approval = { kind: 'approval' as const, askId: 'a', toolName: 'bash', reason: 'rm needs approval', since: 1 }
    expect(askLabel('scratch', 'sess-1', approval)).toBe('remote ask on scratch (sess-1): approval for tool "bash" — rm needs approval')
    expect(askSummary(approval)).toBe('approval a tool=bash (rm needs approval)')
    expect(askSummary({ kind: 'question', askId: 'q', questions: [{}, {}], since: 1 })).toBe('question q (2 items)')
  })

  it('appends durable notices and swallows write failures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'peer-bridge-notices-'))
    const path = join(dir, 'nested', 'asks.jsonl')
    appendAskNotice(path, {
      at: 1, alias: 'scratch', sessionId: 'sess-1', askId: 'ask-1', kind: 'approval', toolName: 'bash', note: 'n',
    })
    expect(readFileSync(path, 'utf8')).toContain('"askId":"ask-1"')
    // A regular file cannot host a directory: the failure must be swallowed.
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'not a directory')
    expect(() => appendAskNotice(join(blocker, 'asks.jsonl'), {
      at: 1, alias: 'a', sessionId: 's', askId: 'x', kind: 'question', note: 'n',
    })).not.toThrow()
    expect(defaultNoticesPath('/home/x/.dsh')).toBe('/home/x/.dsh/peer-bridge/asks.jsonl')
  })
})
