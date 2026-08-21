#!/usr/bin/env bash
#
# Proves the standalone binary is actually standalone (M09-T07).
#
# Runs it from a temporary directory with a scrubbed environment, so nothing
# it needs can come from the repository it was built in — no `drizzle-sqlite/`
# to read migrations from, no `apps/gui/dist/` to serve assets from, no `.env`.
# That is the only way this test can fail for the reason it exists: the
# milestone's own verify line is "the job fails if the asset bundle is missing",
# and a run inside the repo would pass with an empty bundle.
#
# Usage: scripts/smoke-standalone.sh [path-to-binary]

set -euo pipefail

BINARY="${1:-apps/backend/dist/tasker-standalone}"
PORT="${SMOKE_PORT:-8099}"

if [[ ! -x "$BINARY" ]]; then
  echo "smoke: no binary at $BINARY — run \`moon run backend:build-standalone\` first" >&2
  exit 1
fi

BINARY="$(cd "$(dirname "$BINARY")" && pwd)/$(basename "$BINARY")"
WORKDIR="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

fail() {
  echo "smoke: $1" >&2
  echo "--- server log ---" >&2
  cat "$WORKDIR/server.log" >&2 || true
  exit 1
}

cp "$BINARY" "$WORKDIR/tasker"
cd "$WORKDIR"

# `env -i` so PATH, NODE_ENV, DB_HOST and anything else in the ambient shell
# cannot quietly supply what the binary is supposed to carry itself.
env -i HOME="$WORKDIR" PATH=/usr/bin:/bin STANDALONE=true \
  ./tasker --port "$PORT" > server.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS -m 2 "http://localhost:$PORT/" -o /dev/null 2>/dev/null; then break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || fail "the binary exited before it listened"
  sleep 0.5
done

# 1. The index page is the real SPA, not a placeholder and not a 404.
INDEX="$(curl -fsS -m 5 "http://localhost:$PORT/")" || fail "GET / failed"
grep -q 'id="root"' <<<"$INDEX" || fail "GET / did not return the SPA — the asset bundle is missing"

# 2. A fingerprinted asset the index actually references resolves.
ASSET="$(grep -o '/assets/[A-Za-z0-9._-]*\.js' <<<"$INDEX" | head -1)"
[[ -n "$ASSET" ]] || fail "the index references no JS bundle"
curl -fsS -m 5 -o /dev/null "http://localhost:$PORT$ASSET" || fail "asset $ASSET is missing from the bundle"

# 3. A deep link loads the app rather than 404ing.
grep -q 'id="root"' <<<"$(curl -fsS -m 5 "http://localhost:$PORT/tasks/smoke")" \
  || fail "deep link /tasks/smoke did not fall back to the SPA"

# 4. The API answers, against a database the binary created itself, with the
#    full-text index in place — the migrations travelled too.
HEALTH="$(curl -fsS -m 5 "http://localhost:$PORT/tasker.health.v1.HealthService/Ping" \
  -H 'content-type: application/json' -d '{}')" || fail "the health RPC failed"
grep -q 'sqlite+fts5-ok' <<<"$HEALTH" || fail "health reported no working sqlite+fts5: $HEALTH"

# 5. It created its own database where it was told to, from nothing.
[[ -f "$WORKDIR/.data/local.sqlite" ]] || fail "no database was created"

echo "smoke: ok — SPA, deep link, fingerprinted asset, health, and a self-created database"
