#!/usr/bin/env bash

WORKSPACE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PID_FILE="$WORKSPACE_ROOT/.gitnexus-watch.pid"

echo "Checking for existing GitNexus watcher in workspace..."

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    # Verify the process actually exists
    if kill -0 "$PID" 2>/dev/null; then
        echo "Killing existing GitNexus watcher (PID: $PID)..."
        kill -9 "$PID"
        sleep 1
    else
        echo "Stale PID file found. Cleaning up..."
    fi
    rm -f "$PID_FILE"
else
    echo "GitNexus watcher is not currently running."
fi

echo "Starting new GitNexus watcher..."
node .agents/skills/gitnexus-watch/scripts/watch.mjs &
