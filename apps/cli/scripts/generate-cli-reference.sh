#!/usr/bin/env bash
#
# Regenerates docs/cli-reference.md's command section from the binary's own
# help output (M12-T09).
#
# Generated rather than written, because a hand-maintained reference is a
# second account of the interface and the two drift — usually silently, and
# usually right after someone adds a flag.
#
# Usage, from apps/cli:
#   go build -o tasker . && bash scripts/generate-cli-reference.sh
set -euo pipefail
BIN=./tasker
echo "## Command reference"
echo
for group in $($BIN --help | sed -n '/Available Commands:/,/^Flags:/p' | sed '1d;$d' | awk 'NF{print $1}'); do
  echo "### \`tasker $group\`"
  echo
  echo '```'
  $BIN "$group" --help 2>&1 | sed -n '1,/^Use "/p' | sed '$d'
  echo '```'
  echo
done | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba'
