---
id: M31
title: CLI Output Truth
status: done
goal: An agent can drive every CLI command from a script — output on stdout in one stable JSON shape, errors once on stderr with an exit code that says what kind of failure it was, and every page of a list reachable.
depends_on: []
surfaces: [cli, specs]
exit_criteria_met: true
started_at: 2026-10-02
completed_at: 2026-10-02
---

# M31 — CLI Output Truth

## 1. Goal

`TASKER_TOKEN=$(tasker auth token create … --json | jq -r .plaintext)` — the
onboarding line `docs/agent-integration.md` tells every integrator to run —
captures the token. Every command writes its result to stdout and nothing else
there; a failure prints one line to stderr and exits with a code that tells a
script whether to retry, re-authenticate, move on or give up. `--json` is
honoured by every command and emits the RPC response with `protojson` field
names, so a list carries its `page.nextCursor`, and `--page-all` streams every
item of every page as NDJSON.

## 2. Why Now

The 2026-10-02 review ran the built binary and confirmed:

1. **Every command writes to stderr, `--json` included.** Commands print with
   cobra's `cmd.Println`, which writes to `OutOrStderr()`, and `rootCmd` never
   calls `SetOut`. Tests hid it by calling `rootCmd.SetOut(buf)`.
   `tasker auth whoami 2>/dev/null` prints nothing. The documented
   token-capture line captures an empty string and shows the secret on the
   terminal instead.
2. **15 list commands drop the next-page cursor**: `--json` prints the bare
   array, so an agent cannot get past page one of anything.
3. **About 25 commands ignore `--json`** (`orgs list` never prints an org id).
4. **`encoding/json` on protobuf structs** mixes `project_id` with
   `deletedAt` and drops `false`/`0` via `omitempty` — an unstable shape.
5. **Errors print twice** ("Error: Error: …"), every failure exits 1, and
   "Not logged in" exits **0**. `auth whoami` ignores `--token`/`TASKER_TOKEN`.
6. The login callback listens on all interfaces (`:3952`).

COUNCIL-0001 ranked Agent-Facing CLI Ergonomics first on raw score; items 1–4
are its prerequisites, and an agent-first product whose CLI cannot be piped is
not agent-first.

## 3. Exit Criteria

- [x] `tasker <cmd> --json 2>/dev/null` prints the result and
  `tasker <cmd> 1>/dev/null` prints nothing for a successful command — pinned
  by a test that runs `Execute()` with real `os.Stdout`/`os.Stderr` pipes.
- [x] A failing command prints exactly one `Error: …` line to stderr and exits
  with a documented code: 3 auth, 4 not found, 5 conflict/precondition,
  6 invalid argument, 7 unavailable or rate limited, 1 anything else.
- [x] Every command honours `--json`; JSON is `protojson` of the RPC response
  (camelCase, zero values present), so every list carries `page`.
- [x] `--page-all` on list commands emits one JSON object per line for every
  item across every page.
- [x] `auth whoami` reports the identity of whatever credential the command
  would actually use, and exits non-zero when there is none.
- [x] `docs/cli-reference.md` documents output, exit codes and pagination, and
  `moon run cli:format cli:vet cli:test cli:build cli:coverage-gate` is green
  in CI on `main`.

## 4. Scope

**In scope:** the defects in §2 and the task breakdown below.

**Out of scope:**

- `--fields` masks and a `schema` introspection command — the remainder of
  the council's candidate, now unblocked; not needed to make the CLI
  scriptable.
- New agent operations (claim-next, release) — **M33**, which adds their CLI
  surface on top of this milestone's output contract.

## 5. Task Breakdown

- [x] **M31-T01** — Results go to stdout, one error line goes to stderr, and the exit code classifies the failure.
  - **Files**: `apps/cli/cmd/root.go`, every `cmd/*.go` error site
  - **Verify**: new `root_test.go` cases with real pipes; `go test ./...`.
- [x] **M31-T02** — One JSON writer: `protojson` of the whole response, used by every command.
  - **Files**: `apps/cli/cmd/output.go` (new), every `cmd/*.go`
  - **Verify**: `output_test.go`; list JSON carries `page.nextCursor`.
- [x] **M31-T03** — Text output of a list names the next page.
  - **Files**: `apps/cli/cmd/output.go`, list commands
  - **Verify**: tests for a paged and a final page.
- [x] **M31-T04** — `--page-all` streams every item as NDJSON.
  - **Files**: `apps/cli/cmd/output.go`, list commands
  - **Verify**: a fake server with three pages yields every item once.
- [x] **M31-T05** — `whoami` and `debug session` use the resolved credential; the login callback binds loopback only.
  - **Files**: `apps/cli/cmd/{auth,debug}.go`
  - **Verify**: tests with `TASKER_TOKEN` set and no session file.
- [x] **M31-T06** — Documentation and close.
  - **Files**: `docs/cli-reference.md`, `docs/agent-integration.md`,
    `apps/cli/scripts/generate-cli-reference.sh`
  - **Verify**: `moon run :docs-lint`; regenerated reference matches.

## 6. Verification

```
moon run cli:format cli:vet cli:test cli:build cli:coverage-gate
go build -o /tmp/tasker ./apps/cli && /tmp/tasker ping --json 2>/dev/null | jq .
```

## 7. Risks

- **The JSON shape changes** (bare arrays become response objects; field names
  become camelCase). It is a breaking change for any script parsing today's
  output — which, given the stderr bug, could only have been parsing stderr.
  Recorded in the reference and the release notes.
- **Exit codes change** from always-1. A script testing `$? -eq 1` for failure
  must test `-ne 0`; documented.
