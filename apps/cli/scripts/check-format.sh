#!/usr/bin/env bash
# `gofmt -l` lists unformatted files and exits 0. As a moon task that is a gate
# that cannot fail: unformatted Go passed the pre-commit hook and CI while the
# task printed the filename and went green. This turns the list into an exit
# code, and prints it so the failure names the files.
set -euo pipefail

unformatted="$(gofmt -l .)"
if [ -n "$unformatted" ]; then
  echo "unformatted Go (run 'gofmt -w .'):"
  echo "$unformatted"
  exit 1
fi
echo "gofmt clean"
