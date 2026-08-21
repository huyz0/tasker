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
  # brace-expansion — DoS via pathological glob expansion. Reached through
  # minimatch → glob → @storybook/react-vite's docgen plugin. Storybook does
  # not run against untrusted input, and never ships.
  GHSA-mh99-v99m-4gvg GHSA-rgw5-rvv9-x895 GHSA-3jxr-9vmj-r5cp

  # fast-uri — URL parsing confusion. Reached through ajv → @typespec/compiler,
  # which parses this repository's own `.tsp` files at build time. The input is
  # the repository.
  GHSA-7p8r-x3mc-p8w7 GHSA-v2hh-gcrm-f6hx GHSA-q3j6-qgpj-74h6 GHSA-v39h-62p7-jpjc GHSA-4c8g-83qw-93j6

  # js-yaml — quadratic CPU on `!!omap`. Three routes, and one of them *ships*:
  # `@mdxeditor/editor` is a GUI dependency. Accepted rather than urgent
  # because the editor parses markdown, not YAML — nothing in the browser
  # feeds it an `!!omap` — but this is the first line to clear when a fixed
  # version exists.
  GHSA-5p4m-2wfm-xmqj

  # undici — TLS and routing issues in the HTTP client. Reached through jsdom,
  # which exists only for the vitest DOM environment.
  GHSA-4cwx-7wf7-3272 GHSA-vmh5-mc38-953g GHSA-vxpw-j846-p89q GHSA-hm92-r4w5-c3mj

  # ws — memory exhaustion from fragmented frames. Storybook's dev server and
  # vitest's browser mode.
  GHSA-96hv-2xvq-fx4p
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
