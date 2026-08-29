# dsh-enpoi-web-profile

The Enpoi Harness web profile (`~/.dsh/profiles/web`) — versioned so the
whole customization layer survives reinstalls and can be reproduced on any
device. Companion to the fork repo `Darthph0enix7/deepseek-harness`
(see its `STATE.md` for the repo-side modifications).

## Layout

| Path | Purpose |
|---|---|
| `package.json` | Profile manifest: `dsh.profile.bundles` = dsh-base, dsh-web-app, dsh-better-sidebar@0.14.0, skin-center |
| `cordis.patch.yml` | User patch layer: pins `- id: better-sidebar / disabled: false` (the npm bundle's `!!js` double-mount guard silently disables the plugin on this setup) |
| `cordis.yml` | Loader root (empty entry list; patches compose on top) |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Install reproducibility (hoisted linker, build allow-list: node-pty, cpu-features, ssh2) |
| `rebuild-sidebar.sh` | Restores the patched sidebar sources + rebuilds the client bundle + restarts dsh-web. **Run after ANY `dsh plugin`/pnpm reinstall of this profile.** Restores only when the installed src lacks the `MIN_CENTER_COLUMN` marker (never clobbers newer local edits). |
| `sidebar-patch/` | Our patch overlay for dsh-better-sidebar: `src/client/{Sidebar.tsx,split-pane.tsx,layout.css}` + `build-client.{mjs,cjs}` |

## dsh-better-sidebar modification ledger

The npm-published 0.14.0 is broken against dsh rc.2 in three ways; all are
fixed in `sidebar-patch/` + `cordis.patch.yml`:

1. Bare global `React` in `RenderBoundary` (classic JSX runtime with
   externed react) → `ReferenceError: React is not defined` at mount.
   Fixed via `var React = require("react")` in the build banner.
2. `activeTabType` `useMemo` after the no-session early return → React
   error #310 on the welcome→session transition. Fixed by moving the hook
   above the early return (with a `state === undefined` guard).
3. Bundle `!!js` double-mount guard disables the whole row (host
   `/sidebar/api` 404 → client silently unmounts). Fixed by the
   `disabled: false` pin in `cordis.patch.yml`.

Customizations on top:

- **Welcome-screen activity bar**: the vertical icon rail (Files/Git/
  Terminal/Tasks/Browser) renders on the welcome screen too, not just in
  sessions.
- **Layout push includes the 44px activity rail** (`writeGeometry`:
  `width + ACTIVITY_RAIL`) so `#root` snaps exactly to the panel's left
  edge (no dark-line gap between chat and panel).
- **Bottom-panel squeeze anchor**: `#root :has(> [data-slot="conversation"])`
  in `layout.css` — the upstream `[data-dsh-frame] > [data-pane="conversation"]`
  anchor no longer matches this DSH version (bottom panel used to overlay
  the composer).
- **Bottom toggle kick**: `kickMeasure()` re-runs the locate+measure chain
  (hoisted `locateRef` + 8× retry loop) so the panel can't stay
  visibility-hidden. An OPEN panel is never hidden (full-width fallback
  geometry until measured).
- **Single-instance activity views**: activity-rail clicks re-activate the
  pane's existing tab of that type instead of minting new ones (the editor's
  file-tree tab = editor tab with `path === undefined`). No more "new
  terminal every toggle".
- **Terminal-only tab strip**: per-pane `TabBar` renders only when the
  active tab is a terminal (terminal tabs + a `+` that opens another
  terminal + close buttons); other views have no strip.
- **Resize freeze-on-release** (Oracle-reviewed):
  - The layout-push effect never deletes the CSS vars on committed updates
    (cleanup moved to a separate unmount-only effect) — the transient 0px
    fallback forced a sync layout at full width, causing the "reload"
    animation and the host app's left-rail flapping on release.
  - `pointerup` never bails on missing pointer capture and commits
    `lastAppliedRef` (the exact on-screen geometry) first.
  - `abortDrag` is freeze-first: `lastAppliedRef` → pending rAF frame →
    event coordinates (only when real) — **no revert to store sizes**; a
    pure down+up leaves the DOM alone.
  - Bottom drags carry `width = 0` while the right panel is closed (no
    empty right-panel gap mid-drag).
- A width clamp (center ≥ 760px to stop the app's left-rail auto-collapse)
  was tried and REJECTED — do not reintroduce.

## Rebuild pipeline

```bash
# after any reinstall of the profile (dsh plugin / pnpm install):
~/.dsh/profiles/web/rebuild-sidebar.sh
# after rebasing the fork: rebuild the brand package too
cd ~/deepseek-harness && pnpm --filter @deepseek-ai/dsh-client-ui-brand-enpoi run bundle
# restart
systemctl --user restart dsh-web.service
```

## Verification probes

Headless Playwright probes (chromium binary at
`/home/adam/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`):
`/tmp/opencode/pwprobe/` — `probe-resize.mjs` (freeze stress),
`probe-cancel.mjs` (capture-loss sim), `probe-nospike2.mjs` (12ms-sampled
post-release monotonic check), `probe-behavior.mjs` (activity rail +
terminal strip), `probe-bottom.mjs` / `probe-bottom2.mjs` (bottom panel
toggle/squeeze/drag with right panel open/closed).

## Fresh install on a new device

1. **Harness fork** (our engine + UI + orchestration core):
   ```bash
   git clone -b local/serverlocal https://github.com/Darthph0enix7/deepseek-harness ~/deepseek-harness
   cd ~/deepseek-harness && pnpm install && pnpm run build:lib && pnpm run build:web
   ```
2. **Profile** (our plugins + sidebar patches — this repo):
   ```bash
   git clone https://github.com/Darthph0enix7/dsh-enpoi-web-profile ~/dotfiles/dsh-dotfiles
   mkdir -p ~/.dsh/profiles/web
   cp -r ~/dotfiles/dsh-dotfiles/{packages,sidebar-patch,cordis.patch.yml,cordis.yml,package.json,pnpm-workspace.yaml,pnpm-lock.yaml,vitest.config.ts,rebuild-sidebar.sh} ~/.dsh/profiles/web/
   cd ~/.dsh/profiles/web && pnpm install && bash rebuild-sidebar.sh
   ```
3. **Fresh settings** (no providers, no personal config):
   ```bash
   cp ~/dotfiles/dsh-dotfiles/fresh-settings.yaml ~/.dsh/settings.yaml
   ```
4. **Presets + skills** (our agent personas + skills):
   ```bash
   cp -r ~/dotfiles/dsh-dotfiles/presets ~/.dsh/.agent-presets
   cp -r ~/dotfiles/dsh-dotfiles/skills ~/.dsh/skills
   ```
5. **ds CLI**: `cp ~/dotfiles/dsh-dotfiles/fish/ds.fish ~/.config/fish/functions/`
6. Configure your own providers in Settings → Models, then `ds sync` to create your device patch.

**Personal bits never shared**: `settings.yaml` (providers/personas), `device-patches/`, `fresh-settings.yaml` is the only settings file meant for public use.
