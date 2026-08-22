#!/usr/bin/env bash
# Rebuild the dsh-better-sidebar client bundle from the plugin's source and
# restart the web service. The npm-published 0.14.0 lib/client.js has two
# latent bugs that break mounting against dsh rc.2:
#   1. JSX classic runtime leaves a bare global `React` reference in
#      RenderBoundary (ReferenceError: React is not defined at mount).
#   2. `activeTabType` useMemo sits AFTER the no-session early return, so the
#      welcome→session transition changes the hook count (React error #310).
# Both are fixed in the plugin's src/ + build-client.mjs (React shim banner).
# Run this after any `dsh plugin`/pnpm reinstall of the profile, which wipes
# node_modules back to the published (broken) build.
set -euo pipefail

PKG_DIR="$HOME/.dsh/profiles/web/node_modules/dsh-better-sidebar"
if [ ! -d "$PKG_DIR" ]; then
  echo "dsh-better-sidebar not installed in the web profile" >&2
  exit 1
fi
cd "$PKG_DIR"

# Restore the patched source files ONLY when the installed copy lost our
# customizations (any pnpm/dsh-plugin reinstall wipes them). The marker grep
# prevents clobbering NEWER local edits with the older backup.
PATCH_DIR="$HOME/.dsh/profiles/web/sidebar-patch"
if [ -d "$PATCH_DIR" ] && ! grep -q "MIN_CENTER_COLUMN" "$PKG_DIR/src/client/Sidebar.tsx" 2>/dev/null; then
  cp "$PATCH_DIR/src/client/Sidebar.tsx" "$PKG_DIR/src/client/Sidebar.tsx"
  cp "$PATCH_DIR/src/client/split-pane.tsx" "$PKG_DIR/src/client/split-pane.tsx"
  cp "$PATCH_DIR/src/client/layout.css" "$PKG_DIR/src/client/layout.css"
  cp "$PATCH_DIR/build-client.mjs" "$PKG_DIR/build-client.mjs"
  cp "$PATCH_DIR/build-client.cjs" "$PKG_DIR/build-client.cjs"
  echo "restored patched sidebar sources from $PATCH_DIR"
fi

# Point the builder at a local esbuild that exists on this machine.
ESBUILD="$HOME/deepseek-harness/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild"
LIGHTNING="$HOME/deepseek-harness/node_modules/.pnpm/lightningcss@1.32.0/node_modules/lightningcss"
if [ ! -d "$ESBUILD" ]; then
  ESBUILD="$(find "$HOME/deepseek-harness/node_modules/.pnpm" -maxdepth 2 -type d -name 'esbuild@*' | sort | tail -1)/node_modules/esbuild"
fi
if [ ! -d "$LIGHTNING" ]; then
  LIGHTNING="$(find "$HOME/deepseek-harness/node_modules/.pnpm" -maxdepth 2 -type d -name 'lightningcss@*' | sort | tail -1)/node_modules/lightningcss"
fi

# Rewrite the builder's absolute import paths (they may point at a version
# pnpm no longer has after repo updates).
python3 - "$ESBUILD" "$LIGHTNING" <<'PY'
import re, sys
esbuild, lightning = sys.argv[1], sys.argv[2]
for f in ('build-client.mjs',):
    s = open(f).read()
    s = re.sub(r"import \{ build \} from '[^']*esbuild[^']*'",
               f"import {{ build }} from '{esbuild}/lib/main.js'", s)
    s = re.sub(r"import \{ transform \} from '[^']*lightningcss[^']*'",
               f"import {{ transform }} from '{lightning}/node/index.js'", s)
    open(f, 'w').write(s)
s = open('build-client.cjs').read()
s = re.sub(r"require\('[^']*esbuild[^']*'\)", f"require('{esbuild}')", s)
s = re.sub(r"require\('[^']*lightningcss[^']*'\)", f"require('{lightning}')", s)
open('build-client.cjs', 'w').write(s)
print('builder import paths updated')
PY

cd "$PKG_DIR"
node build-client.mjs
node --check lib/client.js
systemctl --user restart dsh-web.service
echo "dsh-better-sidebar rebuilt and dsh-web restarted."
