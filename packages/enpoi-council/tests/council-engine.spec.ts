import { describe, expect, it } from 'vitest'
import {
  BROKER_KEPT_TOOLS,
  COUNCIL_DENIED_TOOLS,
  DEBATER_DENIED_TOOLS,
  RETRIEVAL_TOOLS,
  estimateTokens,
  textOfContent,
} from '../src/core/fiber.ts'
import { extractEvidenceRequests, parseFactSheet } from '../src/core/broker.ts'
import { extractProposals, parseRefereeOutput } from '../src/core/referee.ts'
import { ROUNDTABLE_SPEC } from '../src/profiles/roundtable.ts'

describe('evidence fencing (doc 54 §6, Oracle amendment #2)', () => {
  it('debaters lose ALL retrieval tools — the broker is the only ingress', () => {
    for (const tool of RETRIEVAL_TOOLS) {
      expect(DEBATER_DENIED_TOOLS).toContain(tool)
    }
  })

  it('broker children keep exactly the research surface', () => {
    expect(BROKER_KEPT_TOOLS).toEqual([...RETRIEVAL_TOOLS])
    for (const tool of BROKER_KEPT_TOOLS) {
      expect(COUNCIL_DENIED_TOOLS).not.toContain(tool)
    }
  })

  it('anti-leak core is intact in both tiers', () => {
    for (const t of ['send_message', 'subagent', 'bash', 'edit', 'write', 'memory_save']) {
      expect(DEBATER_DENIED_TOOLS).toContain(t)
      expect(COUNCIL_DENIED_TOOLS).toContain(t)
    }
  })

  it('never names run_code (reserved PTC transport)', () => {
    expect(DEBATER_DENIED_TOOLS).not.toContain('run_code')
    expect(COUNCIL_DENIED_TOOLS).not.toContain('run_code')
  })
})

describe('evidence request extraction', () => {
  it('parses tolerant NEED_EVIDENCE lines', () => {
    const text = [
      'I need ground truth.',
      'NEED_EVIDENCE(target: queue scheduler, question: does claim_next use a lock?)',
      'NEED_EVIDENCE(target: "npm docs", question: "what is the retry default?")',
      'NEED_EVIDENCE(target:, question: empty target ignored)',
    ].join('\n')
    const reqs = extractEvidenceRequests('skeptic', 2, text)
    expect(reqs).toHaveLength(2)
    expect(reqs[0].target).toBe('queue scheduler')
    expect(reqs[1].question).toBe('what is the retry default?')
    expect(reqs[0].ticket).toMatch(/^EV-[0-9a-f]{8}$/)
  })

  it('same question from different seats yields the same ticket (dedupe)', () => {
    const a = extractEvidenceRequests('skeptic', 2, 'NEED_EVIDENCE(target: scheduler, question: lock or row update?)')
    const b = extractEvidenceRequests('architect', 2, 'NEED_EVIDENCE(target: scheduler, question: lock or row update?)')
    expect(a[0].ticket).toBe(b[0].ticket)
  })

  it('parses broker fact sheets', () => {
    const sheet = 'CITATION: src/x.py:12\nFACTS: it uses a row update.\nCONFIDENCE: high'
    const parsed = parseFactSheet(sheet)
    expect(parsed).toEqual({ citation: 'src/x.py:12', facts: 'it uses a row update.', confidence: 'high' })
    expect(parseFactSheet('no structure')).toBeNull()
  })
})

describe('referee output handling', () => {
  it('extracts PROPOSE_CRUX and SPROUT proposals from seat turns', () => {
    const text = 'Blah.\nPROPOSE_CRUX: The lease TTL is too short.\nSPROUT: Ambient dock | a glanceable strip.\nDone.'
    expect(extractProposals(text)).toEqual([
      { kind: 'crux', assertion: 'The lease TTL is too short.' },
      { kind: 'idea', assertion: 'SPROUT: Ambient dock | a glanceable strip.'.replace('SPROUT: ', '') },
    ])
  })

  it('parses referee JSON and sanitizes floors to known seats', () => {
    const raw = JSON.stringify({
      admissions: [{ kind: 'crux', assertion: 'x', author: 'skeptic' }, { kind: 'bogus-kind', assertion: 'y', author: 'z' }],
      flips: [{ id: 'C-1', to: 'contested', reason: 'r' }],
      directives: { skeptic: '1. do x', ghost: 'ignored' },
      floor: { active: ['skeptic', 'ghost-seat'], standby: ['architect'] },
      scopeWarnings: ['drift detected'],
    })
    const out = parseRefereeOutput(raw, ROUNDTABLE_SPEC)
    expect(out.admissions).toHaveLength(1)
    expect(out.flips).toHaveLength(1)
    expect(out.directives).toEqual({ skeptic: '1. do x' })
    expect(out.floor.active).toEqual(['skeptic'])
    expect(out.floor.standby).toEqual(['architect'])
    expect(out.scopeWarnings).toHaveLength(1)
  })

  it('degrades to a no-op pass with full floor on unparseable output', () => {
    const out = parseRefereeOutput('I refuse to emit JSON.', ROUNDTABLE_SPEC)
    expect(out.admissions).toHaveLength(0)
    expect(out.floor.active).toHaveLength(ROUNDTABLE_SPEC.seats.length)
  })
})

describe('text helpers (anti-leak, preserved)', () => {
  it('estimates tokens conservatively', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('extracts text blocks only — reasoning never passes', () => {
    const content = [
      { type: 'reasoning', text: 'private planning' },
      { type: 'text', text: 'the report' },
    ]
    expect(textOfContent(content)).toBe('the report')
  })
})

describe('procedural steelman gate (Oracle gate #5)', () => {
  it('rejects attack flips without a STEELMAN block when the spec mandates steelman', async () => {
    const { enforceSteelman } = await import('../src/core/referee.ts')
    const flips = [
      { id: 'C-1', to: 'contested' as const, reason: 'attacked' },
      { id: 'C-2', to: 'invariant' as const, reason: 'survived' },
    ]
    const gate = enforceSteelman(flips, ROUNDTABLE_SPEC, 'no steelman here, just attacks')
    expect(gate.allowed.map(f => f.id)).toEqual(['C-2'])
    expect(gate.rejected[0]).toMatch(/missing mandatory steelman/)
  })

  it('allows attack flips when a STEELMAN block exists in the transcript', async () => {
    const { enforceSteelman } = await import('../src/core/referee.ts')
    const flips = [{ id: 'C-1', to: 'falsified' as const, reason: 'felled' }]
    const gate = enforceSteelman(flips, ROUNDTABLE_SPEC, 'STEELMAN [skeptic]: Your strongest form is X; the boundary fails here.')
    expect(gave(gate)).toBe(true)
    function gave(g: { allowed: unknown[] }): boolean { return g.allowed.length === 1 }
  })
})
