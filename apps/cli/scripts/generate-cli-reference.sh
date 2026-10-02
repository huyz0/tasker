#!/usr/bin/env bash
#
# Regenerates docs/cli-reference.md's command reference from the binary's own
# help output (M12-T09), in place.
#
# Generated rather than written, because a hand-maintained reference is a
# second account of the interface and the two drift — usually silently, and
# usually right after someone adds a flag.
#
# Everything above the "## Command reference" heading is hand-written and is
# kept; everything from the heading down is replaced. (M31-T06: the script used
# to print only the command section while the documented usage redirected it
# over the whole file, so following the instructions deleted the intro.)
#
# Every command is listed, every subcommand with its own flags: until M31 the
# reference went one level deep and no leaf command's flags were in it.
#
# Usage, from apps/cli:
#   go build -o tasker . && bash scripts/generate-cli-reference.sh            # rewrite the doc
#   go build -o tasker . && bash scripts/generate-cli-reference.sh --check    # fail if it is stale
set -euo pipefail
BIN=./tasker
DOC=../../docs/cli-reference.md
MARKER='## Command reference'

# Strip cobra's trailer ("Use … --help for more") and the global flags block,
# which is identical on every page and documented once in the intro.
help_of() {
  "$BIN" "$@" --help 2>&1 \
    | sed -n '1,/^Use "/p' | sed '$d' \
    | sed '/^Global Flags:/,/^$/d' \
    | awk 'NF { for (; blank > 0; blank--) print ""; print; next } { blank++ }'
}

subcommands_of() {
  "$BIN" "$@" --help 2>&1 | sed -n '/Available Commands:/,/^$/p' | sed '1d' | awk 'NF{print $1}' \
    | grep -v -x -e help -e completion || true
}

generate() {
  echo "$MARKER"
  echo
  for group in $(subcommands_of); do
    echo "### \`tasker $group\`"
    echo
    echo '```'
    help_of "$group"
    echo '```'
    echo
    for sub in $(subcommands_of "$group"); do
      echo "#### \`tasker $group $sub\`"
      echo
      echo '```'
      help_of "$group" "$sub"
      echo '```'
      echo
    done
  done | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba'
}

head_of_doc() {
  awk -v m="$MARKER" '$0 == m {exit} {print}' "$DOC"
}

next="$(head_of_doc; generate)"
if [ "${1:-}" = "--check" ]; then
  if [ "$next" != "$(cat "$DOC")" ]; then
    echo "docs/cli-reference.md is stale - run: cd apps/cli && go build -o tasker . && bash scripts/generate-cli-reference.sh" >&2
    diff <(cat "$DOC") <(printf '%s\n' "$next") | head -40 >&2 || true
    exit 1
  fi
  echo "docs/cli-reference.md is current"
else
  printf '%s\n' "$next" > "$DOC"
fi
