# M31 — Progress Journal

## M31-T01 — Results on stdout, one error on stderr, classified exit codes

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/root.go`, `cmd/ping.go`, 17 command files (error
  sites), `cmd/output_contract_test.go` (new), every `cmd/*_test.go`
  (`executeForTest`, message casing)
- **Verified**: `moon run cli:format cli:vet cli:test cli:build
  cli:coverage-gate` — green, coverage 95.0% (floor 80%).
- **Notes**:
  - `Execute` now calls `runCLI(args, os.Stdout, os.Stderr)`, which sets the
    root's out/err writers. Every command prints with cobra's `cmd.Print*`,
    which writes to `OutOrStderr()`, so setting it once on the root moved
    every result — `--json` included — to stdout without touching a command.
  - A command now reports failure *only* by returning an error;
    `SilenceErrors` stops cobra's own copy and `runCLI` prints one
    `Error: …` line. About 190 sites printed their own message first: the
    `cmd.Println("Error: X")` + `return fmt.Errorf("X")` and
    `cmd.PrintErrf("Failed to X: %v", err)` + `return err` pairs became a
    single `return fmt.Errorf("failed to X: %w", err)` — `%w`, so the exit
    code can still see the Connect code underneath.
  - Exit codes: 3 auth, 4 not found, 5 conflict/precondition (a lost claim),
    6 invalid argument, 7 unavailable/rate-limited, 1 anything else.
  - `ping` used `Run` with its own `os.Exit(1)`; now `RunE`. Password prompts
    write to stderr, so they never land in a captured stdout.
  - Tests set `rootCmd.SetOut(buf)` and read errors from it; they now go
    through `executeForTest`, which prints the returned error the way
    `runCLI` does. The new contract tests use `runCLI` itself with separate
    stdout and stderr.
- **Next**: M31-T02

## M31-T02 — One JSON writer, honoured by every command

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/output.go` (new), every command file,
  `cmd/output_contract_test.go`, `cmd/{ping,repositories}_test.go`
- **Verified**: `moon run cli:format cli:vet cli:test cli:coverage-gate` green.
- **Notes**:
  - `printJSON` marshals the **whole** RPC response with `protojson`
    (`EmitUnpopulated`), compacted to one line — protojson randomizes its
    whitespace deliberately, and a CLI's output is diffed and grepped. 63
    sites printed one field of the response (`res.Msg.Tasks`), which is
    exactly what dropped `page.nextCursor`; they print `res.Msg` now.
  - The shape changed, deliberately: camelCase names, zero values present,
    64-bit integers as strings — the backend's own wire shape. One test had
    pinned `remote_pr_id`, i.e. the unstable shape; it now pins
    `remotePrId`. Small `{"success": …}` acknowledgements stay, with
    camelCase keys (`task_id` → `taskId`).
  - 27 commands ignored `--json` (comments, org/team/membership mutations,
    memory archive/restore/purge/unrelate, set-password, logout, ping); each
    now returns `printJSON(res.Msg)` right after its call succeeds. `orgs
    list`'s text output now shows ids.
  - The documented `jq -r .plaintext` token capture still works:
    `CreateAgentTokenResponse` has a `plaintext` field under protojson too.
- **Next**: M31-T03

## M31-T03 — Text listings name the next page

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/output.go` (`printNextPageHint`), 18 list commands
- **Verified**: `TestTextListingNamesTheNextPageOnlyWhenThereIsOne` — hint on a
  paged response, none on the last page, and `--json` output still parses as
  one document (the first run of the full suite caught exactly that: the hint
  had landed after the JSON branch too, so it is suppressed under `--json`).
- **Next**: M31-T04

## M31-T04 — `--page-all` streams every item as NDJSON

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/cli/cmd/output.go` (`pageAll`, `setPageCursor`,
  `pageItems`), 18 list commands, `cmd/output_contract_test.go`
- **Verified**: `moon run cli:format cli:vet cli:test cli:coverage-gate` green.
- **Notes**: One implementation for all eighteen: the helpers find the request's
  `page.cursor` and the response's repeated message field and
  `page.next_cursor` by protobuf reflection, so each command only wraps its
  existing RPC call in a closure. It starts from `--cursor` when given, stops
  on an empty cursor, refuses a cursor it has already seen (a server bug would
  otherwise loop forever), and caps at 10,000 pages. A structural test walks
  the command tree and fails for any command that has `--cursor` but not
  `--page-all`. Committed together with T03 — they are one change to the same
  eighteen call sites.
- **Next**: M31-T05
