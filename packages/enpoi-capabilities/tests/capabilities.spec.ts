import { describe, it, expect } from 'vitest'
import {
  initialCapabilitiesState,
  evaluateToolCall,
  formatCapabilitiesSnapshot,
  PROTECTED_CAPABILITIES,
  type CapabilitiesState,
} from '../src/index'

describe('enpoi-capabilities unit & enforcement suite', () => {
  it('initializes defaults correctly (MCP default OFF, skills/tools default ON)', () => {
    const state = initialCapabilitiesState()

    // MCP servers must be default OFF per user directive
    expect(state.mcp['plane-mcp']).toBe(false)
    expect(state.mcp['ue-mcp']).toBe(false)

    // Skills must be default ON
    expect(state.skills['project-management']).toBe(true)
    expect(state.skills['tier1-workflow']).toBe(true)

    // Subagents & core tools must be default ON
    expect(state.tools.oracle_review).toBe(true)
    expect(state.tools.roundtable).toBe(true)
    expect(state.tools.fixer).toBe(true)
    expect(state.tools.edit).toBe(true)
  })

  it('merges global settings defaults correctly', () => {
    const globalDefaults: Partial<CapabilitiesState> = {
      tools: { roundtable: false, chorus: false },
      skills: { 'tier1-workflow': false },
      mcp: { 'plane-mcp': true },
    }
    const state = initialCapabilitiesState(globalDefaults)

    expect(state.tools.roundtable).toBe(false)
    expect(state.tools.chorus).toBe(false)
    expect(state.skills['tier1-workflow']).toBe(false)
    expect(state.mcp['plane-mcp']).toBe(true)
    // Other defaults remain intact
    expect(state.tools.oracle_review).toBe(true)
  })

  it('Invariant B1: denies disabled direct tool calls with structured synthetic denial', () => {
    const state = initialCapabilitiesState({
      tools: { oracle_review: false, bash: false },
    })

    const oracleDecision = evaluateToolCall('oracle_review', {}, state)
    expect(oracleDecision.allowed).toBe(false)
    expect(oracleDecision.syntheticResult).toContain('[CAPABILITY_DISABLED]')
    expect(oracleDecision.syntheticResult).toContain('oracle_review')

    const bashDecision = evaluateToolCall('bash', { command: 'ls' }, state)
    expect(bashDecision.allowed).toBe(false)
    expect(bashDecision.syntheticResult).toContain('[CAPABILITY_DISABLED]')
    expect(bashDecision.syntheticResult).toContain('bash')

    // Allowed tool passes
    const editDecision = evaluateToolCall('edit', { filePath: '/test' }, state)
    expect(editDecision.allowed).toBe(true)
  })

  it('Invariant B1: denies disabled specialist worker subagent dispatches via dispatch_task', () => {
    const state = initialCapabilitiesState({
      tools: { fixer: false, designer: false },
    })

    const fixerDecision = evaluateToolCall('dispatch_task', { subagent_type: 'fixer', prompt: 'fix code' }, state)
    expect(fixerDecision.allowed).toBe(false)
    expect(fixerDecision.syntheticResult).toContain('[CAPABILITY_DISABLED]')
    expect(fixerDecision.syntheticResult).toContain("worker 'fixer'")

    const explorerDecision = evaluateToolCall('dispatch_task', { subagent_type: 'explorer', prompt: 'map code' }, state)
    expect(explorerDecision.allowed).toBe(true)
  })

  it('Invariant B1: denies disabled skills via skill loader tool', () => {
    const state = initialCapabilitiesState({
      skills: { 'tier2-workflow': false, 'ue-mcp-skill': false },
    })

    const tier2Decision = evaluateToolCall('skill', { name: 'tier2-workflow' }, state)
    expect(tier2Decision.allowed).toBe(false)
    expect(tier2Decision.syntheticResult).toContain('[SKILL_DISABLED]')
    expect(tier2Decision.syntheticResult).toContain("Skill 'tier2-workflow'")

    const pmDecision = evaluateToolCall('skill', { name: 'project-management' }, state)
    expect(pmDecision.allowed).toBe(true)
  })

  it('Invariant B1: denies disabled MCP tool suites via mcp__ prefix matching', () => {
    const state = initialCapabilitiesState({
      mcp: { 'plane-mcp': false, 'ue-mcp': true },
    })

    const planeDecision = evaluateToolCall('mcp__plane__list_projects', {}, state)
    expect(planeDecision.allowed).toBe(false)
    expect(planeDecision.syntheticResult).toContain('[CAPABILITY_DISABLED]')
    expect(planeDecision.syntheticResult).toContain("MCP Tool suite 'plane-mcp'")

    const ueDecision = evaluateToolCall('mcp__ue__execute_script', {}, state)
    expect(ueDecision.allowed).toBe(true)
  })

  it('Invariant I15: protected infrastructure capabilities can never be disabled', () => {
    const state = initialCapabilitiesState({
      tools: {
        read: false,
        glob: false,
        grep: false,
        'enpoi-context-keeper': false,
        'enpoi-cascade': false,
      },
    })

    // Invariant I15 guarantees these remain true
    for (const p of PROTECTED_CAPABILITIES) {
      expect(state.tools[p]).toBe(true)
      const decision = evaluateToolCall(p, {}, state)
      expect(decision.allowed).toBe(true)
    }
  })

  it('Invariant B3: formats runtime-context snapshot line concisely', () => {
    const allActive = initialCapabilitiesState({
      mcp: { 'plane-mcp': true, 'ue-mcp': true },
    })
    expect(formatCapabilitiesSnapshot(allActive)).toBe('All capabilities, subagents, and skills active.')

    const partiallyDisabled = initialCapabilitiesState({
      tools: { roundtable: false },
      skills: { 'ue-mcp-skill': false },
    })
    const snapshot = formatCapabilitiesSnapshot(partiallyDisabled)
    expect(snapshot).toContain('Disabled Capabilities:')
    expect(snapshot).toContain('roundtable')
    expect(snapshot).toContain('ue-mcp-skill')
    expect(snapshot).toContain('Instruction: Disabled tools and skills must not be invoked.')
  })
})
