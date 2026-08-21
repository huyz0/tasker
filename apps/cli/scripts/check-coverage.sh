#!/usr/bin/env bash
#
# Fails when CLI statement coverage drops below a floor (M12-T06).
#
# The floor is a ratchet, not a target: it is set below where coverage actually
# is, so it catches a slide rather than blocking work at the margin. Raise it
# when the real figure has been comfortably above a higher number for a while.
#
# Produces its own profile rather than reading `cli:test`'s. A cached
# `cli:test` writes no file at all, and declaring `coverage.out` as its output
# makes moon fail the task — `go test` rewrites the profile once per package,
# so what survives the run is not what moon expects to cache. Self-contained is
# a second `go test` run and no coupling.
#
# `-coverpkg` scopes the profile to hand-written code. Without it, 2,665
# generated protobuf getters are counted and the figure reads as single digits:
# true, useless, and duly ignored until it had drifted.

set -euo pipefail

FLOOR="${1:-80}"
PROFILE="$(mktemp)"
trap 'rm -f "$PROFILE"' EXIT

go test -coverprofile="$PROFILE" -coverpkg=./cmd/...,./internal/... ./... > /dev/null

TOTAL_LINE="$(go tool cover -func="$PROFILE" | tail -1)"
PERCENT="$(awk '{print $NF}' <<<"$TOTAL_LINE" | tr -d '%')"

# `awk` rather than bash arithmetic, which is integer-only and would round
# 79.9% up to a pass.
if awk -v p="$PERCENT" -v f="$FLOOR" 'BEGIN { exit !(p < f) }'; then
  echo "coverage: ${PERCENT}% is below the ${FLOOR}% floor" >&2
  echo "" >&2
  echo "The least-covered functions:" >&2
  go tool cover -func="$PROFILE" | sort -k3 -n | head -15 >&2
  exit 1
fi

echo "coverage: ${PERCENT}% (floor ${FLOOR}%)"
