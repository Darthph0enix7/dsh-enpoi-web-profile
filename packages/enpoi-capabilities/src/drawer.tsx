/**
 * CapabilitiesDrawer — Liquid Glass Capabilities & Tools control drawer.
 *
 * Implements:
 * - Dynamic toggling of MCP servers, Skills, and Tools/Subagents.
 * - 0ms optimistic local updates with background server persistence (settings.mutate).
 * - Rollback on persistence rejection with named error handling (Invariant M1).
 * - Invariant I15: Protected infrastructure shown with protected badge and disabled toggle.
 */

import React, { useSyncExternalStore } from 'react'
import type { CapabilitiesState, CapabilityDescriptor } from './types'
import { KNOWN_CAPABILITIES, PROTECTED_CAPABILITIES } from './types'
import { initialCapabilitiesState } from './state'
import css from './drawer.module.css'

// Global in-memory capabilities cache for 0ms render
let globalCaps: CapabilitiesState = initialCapabilitiesState()
const listeners = new Set<() => void>()

function subscribeCaps(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notifyCaps() {
  for (const fn of listeners) fn()
}

/**
 * Optimistically updates a capability with rollback protection on network/RPC rejection (M1).
 */
export async function updateGlobalCapability(kind: 'tool' | 'skill' | 'mcp', id: string, enabled: boolean): Promise<boolean> {
  if (PROTECTED_CAPABILITIES.has(id) && !enabled) return false

  const previous = { ...globalCaps }
  const next: CapabilitiesState = {
    tools: { ...globalCaps.tools },
    skills: { ...globalCaps.skills },
    mcp: { ...globalCaps.mcp },
  }

  if (kind === 'tool') next.tools[id] = enabled
  if (kind === 'skill') next.skills[id] = enabled
  if (kind === 'mcp') next.mcp[id] = enabled

  globalCaps = next
  notifyCaps()

  // Persist globally to settings.yaml with rollback on failure (M1)
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
      // Revert optimistic update on server rejection
      globalCaps = previous
      notifyCaps()
      return false
    }
    return true
  } catch (err: unknown) {
    // Revert optimistic update on network error
    globalCaps = previous
    notifyCaps()
    console.warn(`[enpoi-capabilities] Failed to persist capability '${id}':`, err instanceof Error ? err.message : String(err))
    return false
  }
}

// Initial prime from settings.describe
if (typeof window !== 'undefined') {
  void fetch('/api/settings.describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      method: 'settings.describe',
      rpcId: 'prime-capabilities',
      payload: {},
    }),
  }).then(async (res) => {
    if (!res.ok) return
    const json = await res.json() as { result?: { value?: { namespaces?: Array<{ ns?: string; value?: { capabilities?: Partial<CapabilitiesState> } }> } } }
    const namespaces = json?.result?.value?.namespaces
    const orch = Array.isArray(namespaces) ? namespaces.find(n => n.ns === 'enpoi-orchestration') : undefined
    const serverCaps = orch?.value?.capabilities
    if (serverCaps) {
      globalCaps = initialCapabilitiesState(serverCaps)
      notifyCaps()
    }
  }).catch((err: unknown) => {
    console.warn('[enpoi-capabilities] Initial settings prime failed, using local defaults:', err instanceof Error ? err.message : String(err))
  })
}

export function CapabilitiesDrawer(): React.ReactNode {
  const caps = useSyncExternalStore(subscribeCaps, () => globalCaps)

  const mcpList = KNOWN_CAPABILITIES.filter(c => c.kind === 'mcp')
  const skillList = KNOWN_CAPABILITIES.filter(c => c.kind === 'skill')
  const subagentList = KNOWN_CAPABILITIES.filter(c => c.kind === 'tool' && (c.category === 'supervision' || c.category === 'council' || c.category === 'workers'))
  const coreToolList = KNOWN_CAPABILITIES.filter(c => c.kind === 'tool' && c.category === 'core-tools')

  const renderSection = (title: string, icon: string, items: readonly CapabilityDescriptor[], kind: 'tool' | 'skill' | 'mcp') => {
    const activeCount = items.filter(item => {
      if (kind === 'tool') return caps.tools[item.id] !== false
      if (kind === 'skill') return caps.skills[item.id] !== false
      if (kind === 'mcp') return caps.mcp[item.id] === true
      return true
    }).length

    return (
      <div className={css.card}>
        <div className={css.cardHead}>
          <div className={css.cardHeadLeft}>
            <span>{icon}</span>
            <span>{title}</span>
          </div>
          <span className={css.countPill}>{activeCount} / {items.length} Active</span>
        </div>
        <div className={css.rowList}>
          {items.map(item => {
            const isProtected = PROTECTED_CAPABILITIES.has(item.id)
            const isEnabled = isProtected
              ? true
              : kind === 'tool'
                ? (caps.tools[item.id] !== false)
                : kind === 'skill'
                  ? (caps.skills[item.id] !== false)
                  : (caps.mcp[item.id] === true)

            return (
              <div key={item.id} className={css.row}>
                <div className={css.rowLeft}>
                  <div className={css.rowName}>
                    <span className={css.statusDot} data-active={isEnabled} />
                    <span>{item.name}</span>
                    {isProtected && <span className={css.protectedBadge}>Core</span>}
                  </div>
                  <div className={css.rowDesc} title={item.description}>{item.description}</div>
                </div>
                <label className={css.switch}>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isProtected}
                    onChange={(e) => {
                      void updateGlobalCapability(kind, item.id, e.target.checked)
                    }}
                  />
                  <span className={css.slider} />
                </label>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className={css.container}>
      <header className={css.header}>
        <div>
          <div className={css.title}>Capabilities Control Center</div>
          <div className={css.subtitle}>Dynamic MCP, Skill, and Subagent toggles</div>
        </div>
      </header>

      {renderSection('MCP Tool Suites', '🔌', mcpList, 'mcp')}
      {renderSection('Specialist Skills', '🧩', skillList, 'skill')}
      {renderSection('Subagents & Debaters', '🛡️', subagentList, 'tool')}
      {renderSection('Core System Tools', '⚙️', coreToolList, 'tool')}

      <div className={css.notice}>Toggled capabilities take effect on the next turn.</div>
    </div>
  )
}
