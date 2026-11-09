# M48 recovery evidence — 2026-11-09

Base: published M46 `62a0c3f`; branch `feature/m48-client-recovery`, PR #4.
Toolchain: Bun 1.3.11, Go 1.26.10, Moon 2.4.6. Native execution is Linux;
Windows amd64 and macOS arm64 CLI cross-builds pass under T03.

## Browser journeys

`apps/gui/tests/e2e/live-recovery.spec.ts` uses Chromium, the real application,
and real source RPC/SQL. Only EventService streaming transport bytes are
controlled. Request scope is decoded through the generated contract; no fake
service client or source data is returned. Two pages isolate mutation from the
observing query cache, and the observer stays in the background to avoid focus
refetch. Each recovery requires a new successful ListTasks request and a task
card on screen.

The four scenarios are:

1. Drop once, create a task while the replacement stream has no ready frame,
   then send ready without another domain event: the task appears.
2. Stay on the same stream, discard the task event and deliver resync plus an
   artifact event: task data refreshes and the connection ID stays unchanged.
3. Replace the project while the old reconnect is pending: the old connection
   is aborted, and recovery shows the new project's task without the old one.
4. Fail repeated streams, advance the browser clock to the fallback interval,
   and observe a task created while offline. No stream becomes live.

The initial fixture assumed an unframed JSON request and implicit project
selection; both assumptions were corrected. It now uses the generated decoder
and explicitly selects the seeded project. Review v7 strengthened initial-read
settlement and added scope/polling coverage.

Local verification used a private seeded SQLite backend on :8091 and a separate
Vite server on :5180, preserving the existing :8080/:5173 services and database.
The fixture's optional TASKER_E2E_BACKEND_URL proxy changes only the test route.
Private server keys were distinct. A disposable session printed by the seed
script was revoked and removed from its local log before use.

With the standard seeded backend/GUI, CI runs these tests normally:

```sh
moon run gui:e2e
```

Local isolated run used an external Playwright config selecting system Chromium,
the private frontend URL, one worker and no video:

```sh
TASKER_E2E_BACKEND_URL=http://localhost:8091 \
  bunx playwright test live-recovery.spec.ts \
    --config=/tmp/tasker-m48-playwright.config.ts --workers=1 --reporter=list
```

Restored result: **4 passed** (51.7 seconds in the final local run). Each of
four separate deliberate faults fails its intended journey: omit reconnect
reconciliation, ignore resync, omit scope-abort, or disable offline invalidation.
The first, second and fourth fail waiting for a fresh task request; the scope
case detects the still-open old connection. All source was restored afterward.

These are browser recovery proofs with controlled frames, not a claim of a
browser connected to a failing real broker. T02 separately ran 42 backend feed
tests, 43 focused GUI tests and 11 actual socket/broker tests, including logout.

## Native CLI journeys

```sh
cd apps/cli
go test -race ./cmd -run TestNativeCLIRecoveryJourneys -v -count=1 -timeout=60s
```

Result: **four native subtests pass**, including real accepted-request interrupt,
timeout exit 7, MCP idle beyond its message budget then termination with 130,
and restoration of the original private PTY state after masked-input termination.
The CLI is built from source in an owned temporary directory. Children have
bounded contexts and one waiter registered immediately after Start; cleanup
cancels/kills and awaits completion. Linux PTY coverage adds no dependency.
Removing terminal restoration makes the terminal subtest fail; candidate source
is restored. Native review independently reran all four successfully.

T03 retains five additional fault checks: unary deadline, per-MCP deadline,
idle-input cancellation, repeated command context reset and preserved error-body
causes. The last fails all four auth/debug × timeout/cancel cases if restored.
Full CLI/backend race suites pass, as do real generated event-stream compatibility
and per-page budget tests. Generated CLI reference matches the binary.

## Limits and publication

No throughput, capacity or cross-platform runtime claim is made. Browser clock
advancement makes the fallback interval deterministic; native process/network
and PTY boundaries are real. All required local gates and final-head remote CI
must pass before merge; exact closure results belong in PROGRESS.md.
