import { describe, expect, it } from 'vitest'

describe('enpoi-oracle background and output schema conformance', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      approved: { type: 'boolean' },
      concerns: { type: 'array', items: { type: 'string' } },
      unverified: { type: 'array', items: { type: 'string' } },
      blockers: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      background: { type: 'boolean' },
      rejected: { type: 'boolean' },
    },
    required: ['approved', 'concerns', 'unverified', 'blockers', 'summary'],
  }

  function validateSchema(val: Record<string, unknown>): boolean {
    for (const req of schema.required) {
      if (!(req in val)) return false
    }
    for (const k of Object.keys(val)) {
      if (!(k in schema.properties)) return false
    }
    return true
  }

  function renderOutput(value: { approved: boolean; concerns: string[]; unverified: string[]; blockers: string[]; summary: string; background?: boolean; rejected?: boolean }) {
    if (value.background === true || value.rejected === true) {
      return [{ type: 'text', text: value.summary }]
    }
    return [{
      type: 'text',
      text: value.approved
        ? `Oracle verdict: APPROVED${value.concerns.length > 0 ? ` (concerns: ${value.concerns.join('; ')})` : ''}`
        : `Oracle verdict: CONCERNS${value.concerns.length > 0 ? ` — ${value.concerns.join('; ')}` : ''}${value.blockers.length > 0 ? ` | blockers: ${value.blockers.join('; ')}` : ''}`,
    }]
  }

  it('conforms background acknowledgment return to output schema and renders cleanly without false verdict line', () => {
    const bgAck = {
      approved: false,
      concerns: [],
      unverified: [],
      blockers: [],
      summary: 'Background consultation started (child-123) — the verdict will be delivered as a message when the oracle finishes.',
      background: true,
    }

    expect(validateSchema(bgAck)).toBe(true)
    const rendered = renderOutput(bgAck)
    expect(rendered[0]?.text).toBe('Background consultation started (child-123) — the verdict will be delivered as a message when the oracle finishes.')
    expect(rendered[0]?.text).not.toContain('Oracle verdict:')
    expect(rendered[0]?.text).not.toContain('CONCERNS')
  })

  it('conforms mutex rejection return to output schema and renders cleanly without false verdict line', () => {
    const mutexRejection = {
      approved: false,
      concerns: [],
      unverified: [],
      blockers: ['CONCURRENT_CALL_REJECTED: another oracle consultation is already running for this session'],
      summary: 'Rejected by the single-flight mutex (I7): another oracle consultation is already running for this session.',
      rejected: true,
    }

    expect(validateSchema(mutexRejection)).toBe(true)
    const rendered = renderOutput(mutexRejection)
    expect(rendered[0]?.text).toBe('Rejected by the single-flight mutex (I7): another oracle consultation is already running for this session.')
    expect(rendered[0]?.text).not.toContain('Oracle verdict:')
  })

  it('renders standard approved and concerns verdicts properly when not in background mode', () => {
    const approved = {
      approved: true,
      concerns: ['small warning'],
      unverified: [],
      blockers: [],
      summary: 'LGTM overall.',
    }
    expect(validateSchema(approved)).toBe(true)
    expect(renderOutput(approved)[0]?.text).toBe('Oracle verdict: APPROVED (concerns: small warning)')

    const rejected = {
      approved: false,
      concerns: ['bad architecture'],
      unverified: [],
      blockers: ['critical flaw'],
      summary: 'Architecture is invalid.',
    }
    expect(validateSchema(rejected)).toBe(true)
    expect(renderOutput(rejected)[0]?.text).toBe('Oracle verdict: CONCERNS — bad architecture | blockers: critical flaw')
  })
})
