/**
 * ORDERING: a custom-protocol provider's route namespace only exists after
 * its adapter plugin is part of the built + restarted profile. The reuse flow
 * must return the clear "available after the next restart" result instead of
 * letting settings.mutate reject with a raw error.
 */
import { expect, it } from 'vitest'
import { manifestById } from '../src/manifests.js'
import {
  pendingRestartForManifest,
  pendingRestartMessage,
  settingsNamespaceReady,
  type HeavyDeps,
  type SettingsSeam,
} from '../src/planner.js'

/** Deps whose settings describe lists exactly the given namespaces. */
function depsListing(namespaces: string[], withDescribe = true): HeavyDeps {
  const settings: SettingsSeam = {
    ...withDescribe ? { describe: () => namespaces.map(ns => ({ ns, revision: 1 })) } : {},
    mutate: async () => {},
  }
  return {
    home: '/tmp',
    dshHome: '/tmp/.dsh',
    settings,
    fetchImpl: async () => ({ ok: false, status: 0, text: async () => '' }),
    runStep: async () => ({ exitCode: 0, output: '' }),
  }
}

it('reads a mounted namespace as ready, an absent one as not ready, an unknown seam as undefined', () => {
  expect(settingsNamespaceReady(depsListing(['llm-pi-ai', 'commandcode-provider']), 'commandcode-provider')).toBe(true)
  expect(settingsNamespaceReady(depsListing(['llm-pi-ai']), 'commandcode-provider')).toBe(false)
  expect(settingsNamespaceReady(depsListing([], false), 'commandcode-provider')).toBeUndefined()
})

it('an absent commandcode namespace yields the restart message, never a raw mutate failure', () => {
  const guard = pendingRestartForManifest(depsListing(['llm-pi-ai']), manifestById('commandcode')!)
  expect(guard?.ns).toBe('commandcode-provider')
  expect(guard?.message).toContain('Available after the next restart')
  expect(guard?.message).toContain('commandcode-provider')
})

it('a mounted namespace clears the guard and llm-pi-ai routes never carry it', () => {
  const mounted = depsListing(['llm-pi-ai', 'commandcode-provider'])
  expect(pendingRestartForManifest(mounted, manifestById('commandcode')!)).toBeUndefined()
  expect(pendingRestartForManifest(depsListing(['llm-pi-ai']), manifestById('freellmapi')!)).toBeUndefined()
})

it('the message is the exact operator-facing ordering text', () => {
  expect(pendingRestartMessage('commandcode-provider')).toBe(
    'Available after the next restart — the "commandcode-provider" settings namespace is not registered in the running profile yet (build the profile, then restart the service).',
  )
})
