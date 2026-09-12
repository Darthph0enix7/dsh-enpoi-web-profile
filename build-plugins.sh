#!/usr/bin/env bash
# Rebuild every enpoi-* profile plugin bundle with the canonical esbuild flags.
#
# Harness packages and schemastery stay external (they resolve at runtime from
# the profile's node_modules links into the harness workspace); everything else
# is inlined. Run after any plugin source port, then restart dsh-web.service.
set -u
PROFILE_ROOT="${1:-$HOME/.dsh/profiles/web}"
cd "$PROFILE_ROOT/packages" || exit 1

fail=0
for dir in enpoi-*/; do
  pkg="${dir%/}"
  [ -f "$pkg/src/index.ts" ] || { echo "SKIP (no src/index.ts): $pkg"; continue; }
  if pnpm --dir "$pkg" exec esbuild src/index.ts \
      --bundle --format=esm --platform=node --target=node22 \
      --external:@deepseek-ai/* --external:schemastery \
      --outfile=lib/index.js --log-level=warning 2>"/tmp/opencode/build-$pkg.err"; then
    echo "OK   $pkg  ($(du -h "$pkg/lib/index.js" | cut -f1))"
  else
    echo "FAIL $pkg  — see /tmp/opencode/build-$pkg.err"
    sed -n '1,5p' "/tmp/opencode/build-$pkg.err"
    fail=1
  fi
done
exit $fail
