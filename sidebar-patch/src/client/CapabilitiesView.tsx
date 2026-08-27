import React, { useSyncExternalStore } from 'react'
import type { Context } from '../context-types.ts'
import type { SidebarStore, SidebarTab } from '../state.ts'
import type { SessionScope } from '../api.ts'

/** Minimal 12px monochrome glyphs (currentColor) matching the Liquid Glass theme. */
function iconPlug(size = 12): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg">
      <path d="M5.5 1.5v3M10.5 1.5v3M3.5 7h9v1.5a4.5 4.5 0 0 1-9 0V7ZM8 13v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function iconSparkle(size = 12): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8 6.7 6.7 8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function iconCouncil(size = 12): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="3.75" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="3.5" cy="11.75" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12.5" cy="11.75" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.6 5.4 4.9 9.9M9.4 5.4l1.7 4.5M5.5 11.75h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function iconTerminal(size = 12): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} xmlns="http://www.w3.org/2000/svg">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="m4.75 6.5 2 1.75-2 1.75M8.75 10.25h2.75" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface CapabilitiesState {
  tools: Record<string, boolean>
  skills: Record<string, boolean>
  mcp: Record<string, boolean>
}

export interface CapabilityDescriptor {
  id: string
  name: string
  kind: 'tool' | 'skill' | 'mcp'
  description: string
  category: 'mcp' | 'skills' | 'supervision' | 'council' | 'workers' | 'core-tools'
  defaultEnabled: boolean
  protected?: boolean
}

export const PROTECTED_CAPABILITIES = new Set<string>([
  'enpoi-contracts',
  'enpoi-context-keeper',
  'enpoi-cascade',
  'enpoi-living-brief',
  'read',
  'glob',
  'grep',
])

export const KNOWN_CAPABILITIES: readonly CapabilityDescriptor[] = [
  // MCP Servers (Default OFF)
  { id: 'plane-mcp', name: 'Plane MCP', kind: 'mcp', category: 'mcp', description: 'Project management and backlog tooling', defaultEnabled: false },
  { id: 'ue-mcp', name: 'Unreal Engine MCP', kind: 'mcp', category: 'mcp', description: 'Unreal Engine editor automation and actor controls', defaultEnabled: false },

  // Skills (Default ON)
  { id: 'project-management', name: 'Project Management', kind: 'skill', category: 'skills', description: 'Plane documentation and progress journaling', defaultEnabled: true },
  { id: 'ue-mcp', name: 'UE5 Automation Skill', kind: 'skill', category: 'skills', description: 'Unreal Engine 5 MCP workflows', defaultEnabled: true },
  { id: 'tier1-workflow', name: 'Tier 1 Guided Workflow', kind: 'skill', category: 'skills', description: 'Guided planning with Oracle supervision', defaultEnabled: true },
  { id: 'tier2-workflow', name: 'Tier 2 Ideation Workflow', kind: 'skill', category: 'skills', description: 'Ideation and Roundtable debate planning', defaultEnabled: true },
  { id: 'tier3-workflow', name: 'Tier 3 Full Workflow', kind: 'skill', category: 'skills', description: 'Complex implementation with continuous supervision', defaultEnabled: true },

  // Subagents & Debaters (Default ON)
  { id: 'oracle_review', name: 'The Oracle (Supervisor)', kind: 'tool', category: 'supervision', description: 'Senior supervisor for architectural reviews and plan verification', defaultEnabled: true },
  { id: 'roundtable', name: 'Roundtable Debate', kind: 'tool', category: 'council', description: 'Colosseum dialectic 3-way debate across Skeptic, Architect & Pragmatist', defaultEnabled: true },
  { id: 'chorus', name: 'Chorus Brainstorm', kind: 'tool', category: 'council', description: 'Polyphonic brainstorming across Visionary, Experiencer & Integrator', defaultEnabled: true },
  { id: 'fixer', name: 'Fixer Worker', kind: 'tool', category: 'workers', description: 'Bounded code implementation and localized bug detection', defaultEnabled: true },
  { id: 'explorer', name: 'Explorer Worker', kind: 'tool', category: 'workers', description: 'Codebase mapping and structural pattern discovery', defaultEnabled: true },
  { id: 'librarian', name: 'Librarian Worker', kind: 'tool', category: 'workers', description: 'External documentation research and web fetching', defaultEnabled: true },
  { id: 'designer', name: 'Designer Worker', kind: 'tool', category: 'workers', description: 'UI/UX design systems, layout, and visual polish', defaultEnabled: true },

  // Core System Tools (Default ON)
  { id: 'edit', name: 'File Editor', kind: 'tool', category: 'core-tools', description: 'Direct filesystem edits and string replacements', defaultEnabled: true },
  { id: 'write', name: 'File Writer', kind: 'tool', category: 'core-tools', description: 'File creation and overwrite capabilities', defaultEnabled: true },
  { id: 'bash', name: 'Bash Terminal', kind: 'tool', category: 'core-tools', description: 'Terminal command execution in persistent session', defaultEnabled: true },
  { id: 'memory_save', name: 'Memory Save', kind: 'tool', category: 'core-tools', description: 'Store durable facts into CBDC memory.db', defaultEnabled: true },
  { id: 'memory_search', name: 'Memory Search', kind: 'tool', category: 'core-tools', description: 'Semantic recall across SQLite memory.db', defaultEnabled: true },
] as const

function initialCaps(): CapabilitiesState {
  const tools: Record<string, boolean> = {}
  const skills: Record<string, boolean> = {}
  const mcp: Record<string, boolean> = {}
  for (const cap of KNOWN_CAPABILITIES) {
    if (cap.kind === 'tool') tools[cap.id] = cap.defaultEnabled
    if (cap.kind === 'skill') skills[cap.id] = cap.defaultEnabled
    if (cap.kind === 'mcp') mcp[cap.id] = cap.defaultEnabled
  }
  for (const p of PROTECTED_CAPABILITIES) tools[p] = true
  return { tools, skills, mcp }
}

let globalCapsState: CapabilitiesState = initialCaps()
const listeners = new Set<() => void>()

/** Live skill rows discovered host-side via skill.list (OpenCode-parity dynamics). */
export interface DynamicSkillEntry {
  name: string
  description: string
  modelInvocable: boolean
}

let globalSkills: DynamicSkillEntry[] = []

/** Host-side MCP reachability heartbeat (enpoi-capabilities writes enpoi-orchestration.mcpStatus). */
export interface McpStatusEntry {
  state: 'online' | 'down'
  mounted: boolean
  checkedAt: number
  authError?: boolean
}

/** Server catalog entries (enpoi-orchestration.mcpServers). */
export interface McpServerEntry {
  serverName?: string
  url?: string
}

let globalMcpStatus: Record<string, McpStatusEntry> = {}
let globalMcpServers: Record<string, McpServerEntry> = {}

let snapshotCache: { caps: CapabilitiesState; skills: DynamicSkillEntry[]; mcpStatus: Record<string, McpStatusEntry>; mcpServers: Record<string, McpServerEntry> } = {
  caps: globalCapsState,
  skills: globalSkills,
  mcpStatus: globalMcpStatus,
  mcpServers: globalMcpServers,
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function notify() {
  snapshotCache = { caps: globalCapsState, skills: globalSkills, mcpStatus: globalMcpStatus, mcpServers: globalMcpServers }
  for (const fn of listeners) fn()
}

/** Fetch the real skill catalog for the session's project root. */
export async function refreshSkills(sessionId: string): Promise<void> {
  if (!sessionId) return
  try {
    const res = await fetch('/api/skill.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        method: 'skill.list',
        rpcId: 'skill-list-caps',
        payload: { sessionId },
      }),
    })
    if (!res.ok) return
    const json = await res.json() as { result?: { value?: { skills?: DynamicSkillEntry[] } } }
    const skills = json?.result?.value?.skills
    if (Array.isArray(skills)) {
      globalSkills = skills
      notify()
    }
  } catch {
    // keep last known catalog on transient failures
  }
}

/** Re-read MCP heartbeat + server catalog from settings.describe (cheap, periodic while drawer open). */
export async function refreshMcpStatus(): Promise<void> {
  try {
    const res = await fetch('/api/settings.describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', method: 'settings.describe', rpcId: 'mcp-status-poll', payload: {} }),
    })
    if (!res.ok) return
    const json = await res.json() as { result?: { value?: { namespaces?: Array<{ ns?: string; value?: { mcpStatus?: Record<string, McpStatusEntry>; mcpServers?: Record<string, McpServerEntry> } }> } } }
    const namespaces = json?.result?.value?.namespaces
    const orch = Array.isArray(namespaces) ? namespaces.find(n => n.ns === 'enpoi-orchestration') : undefined
    let changed = false
    if (orch?.value?.mcpStatus && typeof orch.value.mcpStatus === 'object') {
      globalMcpStatus = orch.value.mcpStatus
      changed = true
    }
    if (orch?.value?.mcpServers && typeof orch.value.mcpServers === 'object') {
      globalMcpServers = orch.value.mcpServers
      changed = true
    }
    if (changed) notify()
  } catch {
    // keep last known status on transient failures
  }
}

// Initial prime from describe
if (typeof window !== 'undefined') {
  void fetch('/api/settings.describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      method: 'settings.describe',
      rpcId: 'prime-caps-sidebar',
      payload: {},
    }),
  }).then(async (res) => {
    if (!res.ok) return
    const json = await res.json() as { result?: { value?: { namespaces?: Array<{ ns?: string; value?: { capabilities?: Partial<CapabilitiesState>; mcpStatus?: Record<string, McpStatusEntry>; mcpServers?: Record<string, McpServerEntry> } }> } } }
    const namespaces = json?.result?.value?.namespaces
    const orch = Array.isArray(namespaces) ? namespaces.find(n => n.ns === 'enpoi-orchestration') : undefined
    const serverCaps = orch?.value?.capabilities
    if (serverCaps) {
      const next = initialCaps()
      if (serverCaps.tools) Object.assign(next.tools, serverCaps.tools)
      if (serverCaps.skills) Object.assign(next.skills, serverCaps.skills)
      if (serverCaps.mcp) Object.assign(next.mcp, serverCaps.mcp)
      for (const p of PROTECTED_CAPABILITIES) next.tools[p] = true
      globalCapsState = next
      notify()
    }
    if (orch?.value?.mcpStatus && typeof orch.value.mcpStatus === 'object') {
      globalMcpStatus = orch.value.mcpStatus
      notify()
    }
    if (orch?.value?.mcpServers && typeof orch.value.mcpServers === 'object') {
      globalMcpServers = orch.value.mcpServers
      notify()
    }
  }).catch(() => {})
}

export async function toggleCapability(kind: 'tool' | 'skill' | 'mcp', id: string, enabled: boolean): Promise<boolean> {
  if (PROTECTED_CAPABILITIES.has(id) && !enabled) return false

  const previous = { ...globalCapsState }
  const next: CapabilitiesState = {
    tools: { ...globalCapsState.tools },
    skills: { ...globalCapsState.skills },
    mcp: { ...globalCapsState.mcp },
  }

  if (kind === 'tool') next.tools[id] = enabled
  if (kind === 'skill') next.skills[id] = enabled
  if (kind === 'mcp') next.mcp[id] = enabled

  globalCapsState = next
  notify()

  try {
    const res = await fetch('/api/settings.mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        method: 'settings.mutate',
        rpcId: `toggle-cap-${id}`,
        payload: {
          ns: 'enpoi-orchestration',
          ops: [{ op: 'set', path: ['capabilities', kind === 'tool' ? 'tools' : kind === 'skill' ? 'skills' : 'mcp', id], value: enabled }],
        },
      }),
    })
    if (!res.ok) {
      globalCapsState = previous
      notify()
      return false
    }
    return true
  } catch {
    globalCapsState = previous
    notify()
    return false
  }
}

export interface CapabilitiesViewProps {
  ctx: Context
  store: SidebarStore
  scope: SessionScope
  tab: SidebarTab
  visible: boolean
}

export function CapabilitiesView(props: CapabilitiesViewProps): React.ReactNode {
  const view = useSyncExternalStore(subscribe, () => snapshotCache)
  const caps = view.caps

  // Refresh the live skill catalog every time the drawer opens (and on mount),
  // so newly created/removed skill folders are reflected immediately.
  // MCP heartbeat + server catalog re-poll every 15s while visible.
  const sessionId = props.scope?.sessionId ?? ''
  React.useEffect(() => {
    if (props.visible && sessionId) void refreshSkills(sessionId)
    if (props.visible) void refreshMcpStatus()
  }, [props.visible, sessionId])
  React.useEffect(() => {
    if (!props.visible) return
    const iv = window.setInterval(() => { void refreshMcpStatus() }, 15_000)
    return () => { window.clearInterval(iv) }
  }, [props.visible])

  const mcpList: CapabilityDescriptor[] = (() => {
    const rows = new Map<string, CapabilityDescriptor>()
    for (const c of KNOWN_CAPABILITIES.filter(k => k.kind === 'mcp')) rows.set(c.id, { ...c })
    for (const [id, def] of Object.entries(view.mcpServers)) {
      if (!rows.has(id)) {
        const friendly = def.serverName
          ? def.serverName.charAt(0).toUpperCase() + def.serverName.slice(1)
          : id.replace(/-mcp$/, '').split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        let desc = 'MCP server'
        try { desc = new URL(def.url ?? '').host } catch { /* keep default */ }
        rows.set(id, { id, name: `${friendly} MCP`, kind: 'mcp', category: 'mcp', description: desc, defaultEnabled: false })
      }
    }
    return [...rows.values()]
  })()
  const skillList: CapabilityDescriptor[] = view.skills.map(s => ({
    id: s.name,
    name: s.name.split('-').map(w => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' '),
    kind: 'skill',
    category: 'skills',
    description: s.description,
    defaultEnabled: true,
  }))
  const subagentList = KNOWN_CAPABILITIES.filter(c => c.kind === 'tool' && (c.category === 'supervision' || c.category === 'council' || c.category === 'workers'))
  const coreToolList = KNOWN_CAPABILITIES.filter(c => c.kind === 'tool' && c.category === 'core-tools')

  const renderGroup = (title: string, icon: React.ReactNode, items: readonly CapabilityDescriptor[], kind: 'tool' | 'skill' | 'mcp') => {
    const activeCount = items.filter(item => {
      if (kind === 'tool') return caps.tools[item.id] !== false
      if (kind === 'skill') return caps.skills[item.id] !== false
      if (kind === 'mcp') return caps.mcp[item.id] === true
      return true
    }).length

    return (
      <div style={{
        background: 'rgba(13, 20, 35, 0.65)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '8px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: '#94a3b8',
          paddingBottom: '4px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8b9bb4' }}>
            {icon}
            <span>{title}</span>
          </div>
          <span style={{
            fontSize: '9.5px',
            padding: '1px 6px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#cbd5e1',
          }}>{activeCount} / {items.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map(item => {
            const isProtected = PROTECTED_CAPABILITIES.has(item.id)
            const isEnabled = isProtected
              ? true
              : kind === 'tool'
                ? (caps.tools[item.id] !== false)
                : kind === 'skill'
                  ? (caps.skills[item.id] !== false)
                  : (caps.mcp[item.id] === true)

            // MCP rows: connection heartbeat instead of enable-dot.
            let dotColor = isEnabled ? '#34d399' : '#64748b'
            let dotGlow = isEnabled ? '0 0 5px rgba(52, 211, 153, 0.6)' : 'none'
            let connTitle = ''
            if (kind === 'mcp') {
              const st = view.mcpStatus[item.id]
              const stale = !st || Date.now() - st.checkedAt > 45_000
              if (stale) {
                dotColor = '#475569'; dotGlow = 'none'
                connTitle = 'Checking availability…'
              } else if (st.state === 'down') {
                dotColor = '#e5716f'; dotGlow = '0 0 4px rgba(229, 113, 111, 0.35)'
                connTitle = 'Not reachable — server not running'
              } else if (st.mounted) {
                dotColor = '#34d399'; dotGlow = '0 0 5px rgba(52, 211, 153, 0.6)'
                connTitle = 'Connected & mounted — tools active'
              } else {
                dotColor = '#67dce7'; dotGlow = '0 0 5px rgba(103, 220, 231, 0.45)'
                connTitle = st.authError ? 'Server running · auth rejected' : 'Server running · toggled off'
              }
            }

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}>
                    <span
                      title={kind === 'mcp' ? connTitle : undefined}
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: dotColor,
                        boxShadow: dotGlow,
                        cursor: kind === 'mcp' ? 'help' : undefined,
                      }} />
                    <span>{item.name}</span>
                    {isProtected && (
                      <span style={{
                        fontSize: '8.5px',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        background: 'rgba(103, 220, 231, 0.1)',
                        color: '#67dce7',
                        border: '1px solid rgba(103, 220, 231, 0.2)',
                      }}>Core</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{item.description}</div>
                </div>
                <label style={{
                  position: 'relative',
                  width: '28px',
                  height: '16px',
                  flexShrink: 0,
                  marginLeft: '8px',
                  cursor: isProtected ? 'not-allowed' : 'pointer',
                  opacity: isProtected ? 0.5 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isProtected}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    onChange={(e) => {
                      void toggleCapability(kind, item.id, e.target.checked)
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '16px',
                    background: isEnabled ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    border: `1px solid ${isEnabled ? 'rgba(52, 211, 153, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                    transition: 'all 0.15s ease',
                  }}>
                    <span style={{
                      position: 'absolute',
                      height: '10px',
                      width: '10px',
                      left: isEnabled ? '13px' : '2px',
                      top: '2px',
                      borderRadius: '50%',
                      background: isEnabled ? '#34d399' : '#94a3b8',
                      boxShadow: isEnabled ? '0 0 6px rgba(52, 211, 153, 0.8)' : 'none',
                      transition: 'all 0.15s ease',
                    }} />
                  </span>
                </label>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '12px',
      overflowY: 'auto',
      gap: '10px',
      color: '#e2e8f0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '4px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>Capabilities Control Center</h3>
        <p style={{ fontSize: '10.5px', color: '#94a3b8', margin: 0 }}>Toggle MCPs, Skills & Subagents in real time</p>
      </div>

      {renderGroup('MCP Tool Suites', iconPlug(), mcpList, 'mcp')}
      {skillList.length > 0
        ? renderGroup('Specialist Skills', iconSparkle(), skillList, 'skill')
        : (
          <div style={{
            background: 'rgba(13, 20, 35, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '10.5px',
            color: '#94a3b8',
          }}>
            No skills discovered yet — open a session to load the live catalog. Drop a folder with a SKILL.md into ~/.dsh/skills/ to add one.
          </div>
        )}
      {renderGroup('Subagents & Debaters', iconCouncil(), subagentList, 'tool')}
      {renderGroup('Core System Tools', iconTerminal(), coreToolList, 'tool')}
    </div>
  )
}
