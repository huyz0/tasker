# M46 process recovery evidence — 2026-11-09

Candidate worktree: `feature/m46-event-recovery`, based on main `5d598aa`.
Runtime: Bun 1.3.11, Moon 2.4.6, Go 1.26.10; MySQL 8.4.13 and NATS 2.10
Alpine, local Docker 29.9.2/vfs. Existing shared services were preserved; tests
created and removed only generated schemas, private brokers and temporary files.
Credentials were supplied privately from the managed test service.

## Real failure boundaries

With `TASKER_REAL_INTEGRATION=1 TASKER_MYSQL_INTEGRATION=1` and disposable-schema
MySQL credentials:

```sh
bun test apps/backend/src/test/wire/domainEventRecovery.integration.test.ts
```

Result: **2 pass, 0 fail, 56 assertions**, SQLite 11.9 seconds and MySQL 20.2
seconds. Each driver proves:

1. SIGKILL after actual keyed task/folder/artifact commit leaves three source
   events and one matching webhook delivery, with no relay completion.
2. SIGKILL after JetStream ACK but before SQL bookkeeping; another process
   recovers the lease and the broker contains three stable-ID messages.
3. A duplicate reference with a fresh transport ID yields one audit row per
   producer event. The actual consumer uses a custom DB_PATH and loads the full
   1.1 MB artifact from SQL. No webhook is enqueued by this replay.
4. A signed HTTP worker is SIGSTOPped. A successor records success; returning
   503 to the resumed owner changes neither result nor endpoint counters.
5. The private broker stops, a new task commits, and the running relay retains
   attempted pending work. Restarting that broker and consumer yields all four
   audit rows and delivered sources. Graceful worker stop exits successfully.

Lease expiry is a controlled clock offset of 61 seconds, not a real one-minute
pause. Process signals, broker stop/start, SQL and HTTP are real. This is
correctness evidence, not a capacity measurement or a production deployment.

## Regressions and surrounding gates

The process test initially failed at SQL reference projection because the
consumer ignored DB_PATH. The fix uses the configured path in setupDatabase.
Relay diagnostics then failed an independent privacy review; 11 relay tests
pass after correction. Deliberately restoring raw-message persistence fails
three assertions/tests; the candidate was restored before full verification.

```sh
TASKER_REAL_INTEGRATION=1 TASKER_STREAM_LIFECYCLE_INTEGRATION=1 \
  NATS_URL=nats://127.0.0.1:4222 STANDALONE=true \
  bun test apps/backend/src/test/wire/wire.integration.test.ts \
    apps/backend/src/test/wire/durableEvents.integration.test.ts \
    apps/backend/src/modules/events/realtime.integration.test.ts
```

Result: **12 pass, 0 fail**, including current-credential logout over an already
open real feed and mutation-to-audit delivery.

With `TASKER_MYSQL_INTEGRATION=1` and an owned disposable outer schema:

```sh
bun test apps/backend/src/db/auditIdentity.migration.test.ts \
  apps/backend/src/lib/domainEventRelay.mysql.test.ts \
  apps/backend/src/lib/domainEventOutbox.mysql.test.ts \
  apps/backend/src/modules/webhooks/delivery.mysql.test.ts
```

Result: **5 pass, 0 fail**, including the SQLite populated upgrade and four real
MySQL cases. T03/T04/T06 journals retain their separate fencing, sequence-index,
atomic-capture, drain and total-deadline deliberate-break evidence.

The native Moon action's actual shell block installed the official pinned
binary and passed all 35 local gates. Bunx-launching Moon was rejected because
it changed the interpreter used by Node test commands. The standalone build
and scrubbed-directory smoke passed: SPA, deep link, fingerprinted asset,
health and self-created database. Final local gates and remote run URLs are
recorded in PROGRESS.md; upstream bootstrap failures are not waived as passes.
