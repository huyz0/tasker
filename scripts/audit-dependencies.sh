#!/usr/bin/env bash
#
# Dependency vulnerability scanning (M11-T11).
#
# A ratchet, not a snapshot. It fails on any high or critical advisory that is
# not explicitly accepted below, which means a *new* one breaks the build while
# the ones already present — none of which we can fix from here — do not leave
# the job permanently red. A gate that is always failing gets ignored, and an
# ignored gate is worse than no gate, because it looks like coverage.
#
# To accept a new advisory, add its id here with a reason and a route. To clear
# one, run `bun update` and delete the line.
#
# Usage: scripts/audit-dependencies.sh [--report]
#   --report  print everything, including what is accepted, and exit 0

set -uo pipefail

# Every entry is transitive through a *development* dependency, verified with
# `bun why`. None reaches the compiled backend binary or the shipped GUI
# bundle unless noted.
# GHSA identifiers, which is what `bun audit --ignore` matches on — the
# numeric ids in `--json` output are a different namespace and are silently
# ignored, which looks exactly like the gate working.
ACCEPTED=(
  # Empty. The last refresh (2026-10-02) cleared every advisory that had been
  # accepted here — brace-expansion, fast-uri, js-yaml, undici, ws — by moving
  # to patched releases within the existing ranges, plus nodemailer 9 → 10.
)

# One `--ignore=` per id. A comma-separated list is accepted without complaint
# and matches nothing, so the gate looks green while ignoring nothing — which
# is the worst of both behaviours and is how this was nearly shipped.
IGNORE_FLAGS=()
for id in "${ACCEPTED[@]}"; do IGNORE_FLAGS+=("--ignore=$id"); done

if [[ "${1:-}" == "--report" ]]; then
  echo "=== every advisory, including accepted ==="
  bun audit || true
  exit 0
fi

echo "auditing dependencies (accepting ${#ACCEPTED[@]} known advisories)…"
if bun audit --audit-level=high "${IGNORE_FLAGS[@]}"; then
  echo "audit: no new high or critical advisories"
  exit 0
fi

cat >&2 <<'MSG'

audit: a high or critical advisory was found that is not on the accepted list.

  * If a fix exists:  bun update, then remove any now-stale ids from
    scripts/audit-dependencies.sh.
  * If it does not:   add the id to ACCEPTED with a reason and the route it
    reaches us by (`bun why <package>`), and say whether it ships.

Do not widen --audit-level to make this pass.
MSG
exit 1
