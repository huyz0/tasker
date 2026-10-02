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
