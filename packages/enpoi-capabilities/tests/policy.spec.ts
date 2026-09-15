import { describe, expect, it } from 'vitest'
import {
  resolvePolicy, splitCompoundCommand, stripEnvPrefixes, matchBashPattern,
  mcpLadder, SHIPPED_TOOL_DEFAULTS, type PermissionPolicyConfig,
} from '../src/policy'

const EMPTY: PermissionPolicyConfig = {}

describe('compound command splitting', () => {
  it('splits && || ; | and newlines, never inside quotes', () => {
    expect(splitCompoundCommand('a && b || c; d | e')).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(splitCompoundCommand('echo "a && b" && rm x')).toEqual(['echo "a && b"', 'rm x'])
    expect(splitCompoundCommand('grep "a; b" file')).toEqual(['grep "a; b" file'])
    expect(splitCompoundCommand('ls\nrm x')).toEqual(['ls', 'rm x'])
  })
})

describe('bash pattern semantics', () => {
  it('bare token matches argv0 exactly (rm ≠ rmdir)', () => {
    expect(matchBashPattern('rm', 'rm -rf /x')).toBe(true)
    expect(matchBashPattern('rm', 'rmdir /x')).toBe(false)
    expect(matchBashPattern('shutdown', 'shutdown now')).toBe(true)
  })
  it('rm* binds the star to args, not the argv0 prefix', () => {
    expect(matchBashPattern('rm*', 'rm -rf /x')).toBe(true)
    expect(matchBashPattern('rm*', 'rmdir /x')).toBe(false)
  })
  it('space patterns glob the full command', () => {
    expect(matchBashPattern('git *', 'git status --short')).toBe(true)
    expect(matchBashPattern('chmod -R *', 'chmod -R 755 /srv')).toBe(true)
    expect(matchBashPattern('git *', 'gitk')).toBe(false)
  })
  it('strips env prefixes before matching', () => {
    expect(stripEnvPrefixes('FOO=1 BAR=2 rm -rf /x')).toBe('rm -rf /x')
  })
})

describe('resolution order (Oracle-amended)', () => {
  it('agent pattern outranks the agent tool policy (patterns first at every tier)', () => {
    const cfg: PermissionPolicyConfig = {
      agents: { fixer: { tools: { bash: 'ask' }, bashPatterns: [{ pattern: 'git commit*', policy: 'allow' }] } },
    }
    const d = resolvePolicy({ toolName: 'bash', command: 'git commit -m fix', agent: 'fixer', config: cfg })
    expect(d.kind).toBe('allow')
    expect(d.source).toContain('agent pattern')
  })

  it('compound: deny in ANY sub-command denies; ask aggregates upward', () => {
    const cfg: PermissionPolicyConfig = { tools: { bash: 'allow' }, bashPatterns: [{ pattern: 'rm', policy: 'ask' }, { pattern: 'dd*', policy: 'deny' }] }
    const d = resolvePolicy({ toolName: 'bash', command: 'git status && rm -rf /', config: cfg })
    expect(d.kind).toBe('ask')
    expect(d.source).toContain('pattern:rm')
    const d2 = resolvePolicy({ toolName: 'bash', command: 'rm x && dd if=/dev/zero of=/dev/sda', config: cfg })
    expect(d2.kind).toBe('deny')
    expect(d2.source).toContain('dd')
  })

  it('deny terminates before ask anywhere in the compound', () => {
    const cfg: PermissionPolicyConfig = { bashPatterns: [{ pattern: 'reboot', policy: 'deny' }, { pattern: 'rm', policy: 'ask' }] }
    const d = resolvePolicy({ toolName: 'bash', command: 'rm x ; reboot', config: cfg })
    expect(d.kind).toBe('deny')
    expect(d.source).toContain('pattern:reboot')
  })

  it('agent deny outranks a global allow', () => {
    const cfg: PermissionPolicyConfig = { tools: { web_search: 'allow' }, agents: { designer: { tools: { web_search: 'deny' } } } }
    expect(resolvePolicy({ toolName: 'web_search', agent: 'designer', config: cfg }).kind).toBe('deny')
    expect(resolvePolicy({ toolName: 'web_search', agent: 'fixer', config: cfg }).kind).toBe('allow')
  })

  it('read-only veto denies mutations regardless of policy', () => {
    const cfg: PermissionPolicyConfig = { tools: { bash: 'allow', edit: 'allow' } }
    expect(resolvePolicy({ toolName: 'bash', command: 'ls', config: cfg, sandboxMode: 'read-only' }).kind).toBe('deny')
    expect(resolvePolicy({ toolName: 'edit', config: cfg, sandboxMode: 'read-only' }).kind).toBe('deny')
    expect(resolvePolicy({ toolName: 'read', config: cfg, sandboxMode: 'read-only' }).kind).toBe('allow')
  })

  it('grants short-circuit an ask at the same granularity only', () => {
    const cfg: PermissionPolicyConfig = {
      tools: { bash: 'ask' },
      grants: { g1: { id: 'g1', tool: 'bash', pattern: 'rm' } },
    }
    // pattern ask + matching pattern grant → allow
    expect(resolvePolicy({ toolName: 'bash', command: 'rm -rf /tmp/x', config: cfg }).kind).toBe('allow')
    // a different asking pattern is NOT absorbed by a pattern grant
    expect(resolvePolicy({ toolName: 'bash', command: 'dd if=x of=y', config: cfg }).kind).toBe('ask')
    // tool-level grant (no pattern) never absorbs a pattern ask
    const cfg2: PermissionPolicyConfig = {
      tools: { bash: 'ask' },
      grants: { g2: { id: 'g2', tool: 'bash' } },
      bashPatterns: [{ pattern: 'rm', policy: 'ask' }],
    }
    expect(resolvePolicy({ toolName: 'bash', command: 'rm x', config: cfg2 }).kind).toBe('ask')
  })

  it('agent-scoped grants only apply to that agent', () => {
    const cfg: PermissionPolicyConfig = {
      tools: { bash: 'ask' },
      grants: { g3: { id: 'g3', tool: 'bash', agent: 'fixer' } },
    }
    // The shipped catch-all now allows unpatterned commands — the grant only
    // matters when the tool-level policy would ask (a bare bash with no
    // patterns at all). Scope both to a patternless-ask config to keep the
    // grant-tier semantics under test.
    expect(resolvePolicy({ toolName: 'bash', command: 'ls', agent: 'fixer', config: cfg }).kind).toBe('allow')
    // The shipped catch-all allows unpatterned commands, so the agent-scope
    // grant check must use a config that makes THIS command ask: an explicit
    // user pattern (user patterns outrank the shipped catch-all).
    const designerCfg: PermissionPolicyConfig = { tools: { bash: 'ask' }, grants: cfg.grants, bashPatterns: [{ pattern: 'ls', policy: 'ask' }] }
    expect(resolvePolicy({ toolName: 'bash', command: 'ls', agent: 'designer', config: designerCfg }).kind).toBe('ask')
  })

  it('hidden surfaces: substitution/wrapper with a dangerous verb asks', () => {
    expect(resolvePolicy({ toolName: 'bash', command: 'echo $(rm -rf /tmp/x)', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'bash -c "rm -rf /tmp/x"', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'find . | xargs rm', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'echo `rm file`', config: EMPTY }).kind).toBe('ask')
    // plain dangerous commands already ask structurally
    expect(resolvePolicy({ toolName: 'bash', command: 'rm -rf /tmp/x', config: EMPTY }).kind).toBe('ask')
    // a benign hidden surface stays allowed
    expect(resolvePolicy({ toolName: 'bash', command: 'echo $(date)', config: EMPTY }).kind).toBe('allow')
    // git rm is structurally matched by `git *` and has no hidden surface
    expect(resolvePolicy({ toolName: 'bash', command: 'git rm file.txt', config: EMPTY }).kind).toBe('allow')
  })

  it('opaque executors ask (payload pipes and inline interpreter code)', () => {
    expect(resolvePolicy({ toolName: 'bash', command: 'echo cm0= | base64 -d | bash', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'bash script.sh', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'python -c "import os; os.remove(\'x\')"', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'sh -c "ls"', config: EMPTY }).kind).toBe('ask')
    // plain interpreter invocations of a file are ordinary work
    expect(resolvePolicy({ toolName: 'bash', command: 'python script.py --flag', config: EMPTY }).kind).toBe('allow')
    // an Always-allow grant pins the exact command
    const cfg = { grants: { g: { id: 'g', tool: 'bash', pattern: 'bash script.sh' } } }
    expect(resolvePolicy({ toolName: 'bash', command: 'bash script.sh', config: cfg }).kind).toBe('allow')
  })

  it('multi-line compound commands evaluate every line', () => {
    expect(resolvePolicy({ toolName: 'bash', command: 'ls -la\nrm -rf /tmp/x', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'ls -la\necho done', config: EMPTY }).kind).toBe('allow')
  })

  it('memory tools are allowed by default (sub-agents remember)', () => {
    expect(resolvePolicy({ toolName: 'memory_save', config: EMPTY }).kind).toBe('allow')
    expect(resolvePolicy({ toolName: 'memory_search', config: EMPTY }).kind).toBe('allow')
    expect(resolvePolicy({ toolName: 'memory_rescind', config: EMPTY }).kind).toBe('allow')
  })

  it('mcp wildcards: exact > server > family > default', () => {
    const cfg: PermissionPolicyConfig = { tools: { 'mcp__plane__*': 'ask' } }
    expect(resolvePolicy({ toolName: 'mcp__plane__create_page', config: cfg }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'mcp__ue__do_thing', config: cfg }).kind).toBe('ask')   // mcp__* not set → default ask
    const cfg2: PermissionPolicyConfig = { tools: { 'mcp__plane__create_page': 'allow', 'mcp__*': 'deny' } }
    expect(resolvePolicy({ toolName: 'mcp__plane__create_page', config: cfg2 }).kind).toBe('allow')
    expect(resolvePolicy({ toolName: 'mcp__ue__do_thing', config: cfg2 }).kind).toBe('deny')
  })

  it('unconfigured tools default to ask; unpatterned bash runs free (catch-all)', () => {
    expect(resolvePolicy({ toolName: 'brand_new_tool', config: EMPTY }).kind).toBe('ask')
    expect(resolvePolicy({ toolName: 'read', config: EMPTY }).kind).toBe('allow')
    // Adam's OpenCode model: unpatterned commands allow; only the dangerous
    // list asks.
    expect(resolvePolicy({ toolName: 'bash', command: 'ls', config: EMPTY }).kind).toBe('allow')
    expect(resolvePolicy({ toolName: 'bash', command: 'rm -rf /tmp/x', config: EMPTY }).kind).toBe('ask')
  })

  it('shipped defaults: adam-like flow works out of the box', () => {
    expect(SHIPPED_TOOL_DEFAULTS.edit).toBe('allow')
    expect(SHIPPED_TOOL_DEFAULTS.bash).toBe('ask')
    expect(resolvePolicy({ toolName: 'bash', command: 'git status', config: EMPTY }).kind).toBe('allow')
    expect(resolvePolicy({ toolName: 'bash', command: 'shutdown now', config: EMPTY }).kind).toBe('ask')
  })
})
