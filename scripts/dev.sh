#!/usr/bin/env bash
# One-command local dev: starts the backend (STANDALONE mode, embedded
# SQLite - no Docker/MySQL required) and the GUI dev server together, with
# both processes' logs interleaved in this terminal. Ctrl-C stops both.
#
# Previously, debugging a full-stack issue meant opening two terminals and
# remembering the right env vars for each - easy to get out of sync, and an
# easy thing to forget how to do again after a few weeks away from the repo.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKEND_PID=""
GUI_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$GUI_PID" ] && kill "$GUI_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
# Only trap EXIT - it fires on every exit path (normal, `set -e`, or a
# signal), so also trapping INT/TERM would run cleanup twice.
trap cleanup EXIT

# Every backend RPC requires a session, and completing real Google OAuth by
# hand is not a reasonable first-run step. The GUI bootstraps a dev session
# through /api/auth/test/inject, which the backend refuses with 403 unless
# ENABLE_TEST_LOGIN is set - so without this the documented dev command yields
# an app that renders nothing but console 403s. Defaulted, not forced, so a
# developer can still start the stack with the endpoint disabled:
#   ENABLE_TEST_LOGIN=false moon run dev
# The backend refuses to boot at all with this enabled under NODE_ENV=production
# (see apps/backend/src/config.ts), so it cannot leak out of local dev.
export ENABLE_TEST_LOGIN="${ENABLE_TEST_LOGIN:-true}"

echo "Starting backend (STANDALONE mode, SQLite at apps/backend/.data/local.sqlite)..."
echo "  test login: ENABLE_TEST_LOGIN=$ENABLE_TEST_LOGIN"
(cd apps/backend && STANDALONE=true bun run src/index.ts 2>&1 | sed -e 's/^/[backend] /') &
BACKEND_PID=$!

echo "Starting GUI dev server..."
(cd apps/gui && bun run dev 2>&1 | sed -e 's/^/[gui]     /') &
GUI_PID=$!

echo ""
echo "Backend: http://localhost:8080 (ping with 'tasker ping', debug config at /api/debug/config)"
echo "GUI:     http://localhost:5173"
echo "Press Ctrl-C to stop both."
echo ""

wait "$BACKEND_PID" "$GUI_PID"
