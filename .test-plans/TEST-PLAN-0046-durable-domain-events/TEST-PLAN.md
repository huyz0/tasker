# M46 event durability scenarios

## Capture (T02)

- Given a successful emitted mutation, then its domain row, immutable source
  event and every currently matching webhook delivery commit together.
- Given a failed mutation or event/delivery insert, then none of those writes
  commit and no broker message is sent.
- Given a later modification of the payload object, then the stored event keeps
  the values originally emitted.
- Given a purged task, then captured routing still identifies its project/org.
- Given two organizations, then only the event's matching organization/project
  endpoints receive a delivery.
- Given capture enabled and no unit, then publication fails closed.

Run: `bun test src/lib/domainEventOutbox.test.ts` in apps/backend, plus both
migration suites and real MySQL capture tests.

## Relay (T03)

- Given a committed pending event and no broker, then it survives a new relay
  instance and succeeds once publication is available.
- Given acknowledgement loss, then retries use the same event/message ID.
- Given two relays, then only one live lease owns an event. If its lease expires,
  a successor can recover it and the old token cannot mark success or retry.
- Given a failed publication, then attempts/error/backoff persist; the event is
  never discarded because of age or attempt count.
- Given a large source payload, then the broker reference stays bounded and
  the full source remains available for audit/webhooks.

Run: domain relay tests and real JetStream outage/recovery verification.

## Projection and lifecycle (T04)

- Given duplicate references with different broker sequences, then one audit row
  is created from the stored original payload and producer time.
- Given a reused broker sequence and a different producer ID, then a distinct
  audit row is created.
- Given a legacy full-payload message, then legacy deduplication still works.
- Given standalone without a broker, then a locally projected event survives
  restart and duplicate projection is a no-op.
- Given broker startup failure then recovery, then pending events publish and
  new feed/health requests use the recovered connection.
- Given draining, then no new leases start, active bounded work settles, and
  unprocessed events remain pending for restart.

## End-to-end (T05)

- Given a real task change committed before the producer is stopped, then a new
  process relays the stored event, queues no duplicate webhook, and produces
  one audit row.
- Given an interrupted workflow, then neither its tasks nor its domain events
  or webhook rows are externally visible.
- Given disposable MySQL, SQLite and NATS services, run the targeted cases and
  full local gates; record exact commands and deliberate-break evidence.

## Activation regression commands (T04)

- Given an unknown unary method, even one named GetAndCreate, then mutation and
  captured event commit atomically; capture failure rolls back the mutation.
- Given an explicit read or any stream, then it never opens a write unit.
- Given external repository preparation, then network calls occur outside a SQL
  unit and current credentials/permissions are rechecked inside the later write.
- Given a stalled-alert capture failure, then its deduplication claim rolls back
  and the next detection remains eligible.
- Given a schedule firing from a foreign outer presentation context, then task
  and run events carry the actual firing project and organization.
- Given idle drain followed by a late request during pre-drain delay, then the
  real server refuses the mutation and creates no task.
- Given a SQL failure containing a private artifact fixture, then structured
  error output, error ring, tracing exception and tracing status omit its body.
- Given populated old audit tables in both dialects, then migration preserves
  payload/time, backfills legacy identity and permits new producer IDs sharing
  the old sequence. Deliberately retaining sequence uniqueness fails the test.

Run in the backend or with these repository-relative paths:

```sh
bun test apps/backend/src/consumers/durableAudit.test.ts apps/backend/src/lib/mutationInterceptor.test.ts apps/backend/src/lib/domainEventRuntime.test.ts
bun test apps/backend/src/lib/externalMutationBoundary.test.ts apps/backend/src/lib/backgroundWorker.test.ts apps/backend/src/lib/databaseErrorDetails.test.ts apps/backend/src/lib/telemetry/otel.test.ts
TASKER_REAL_INTEGRATION=1 TASKER_STREAM_LIFECYCLE_INTEGRATION=1 NATS_URL=nats://127.0.0.1:4222 bun test apps/backend/src/test/wire/wire.integration.test.ts apps/backend/src/test/wire/durableEvents.integration.test.ts
TASKER_MYSQL_INTEGRATION=1 bun test apps/backend/src/db/auditIdentity.migration.test.ts apps/backend/src/lib/domainEventRelay.mysql.test.ts apps/backend/src/lib/domainEventOutbox.mysql.test.ts
```

Configure DB_HOST/DB_USER/DB_PASSWORD and DB_NAME for a newly created disposable
MySQL database before the last command. Upgrade/relay tests create their own
additional owned schemas; capture uses the configured disposable database. No
existing database should be reset. Required CI provisioning is owned by M49.

## Webhook ownership and total deadline (T06)

- Given sender A pauses past its lease and B records success or failure, then A's
  later success or failure changes neither B's delivery result nor endpoint
  counters/disablement. Run all four combinations on SQLite and fenced failure
  plus counter rollback on real MySQL.
- Given endpoint-counter persistence fails after the delivery update, then the
  whole result unit rolls back and the pending lease can be recovered later.
- Given drain while a sender is active, then it finishes but no further lease
  starts. Given one error reporter throws, then other active sends still settle
  before the sweep returns its error.
- Given a continuously trickling response or stalled DNS, then the total deadline
  rejects the attempt even without an inactivity timeout. Existing redirect,
  connection-time SSRF, body/header and signature tests remain green.

```sh
bun test apps/backend/src/modules/webhooks/delivery.test.ts apps/backend/src/modules/webhooks/delivery.fencing.test.ts apps/backend/src/modules/webhooks/httpSender.test.ts
TASKER_MYSQL_INTEGRATION=1 bun test apps/backend/src/modules/webhooks/delivery.mysql.test.ts
```

The MySQL case creates/removes only a generated disposable schema. Deliberately
remove the token predicate (SQLite/MySQL), replace worker allSettled with all,
or remove the sender total timer; each corresponding regression must fail.

## Real process and broker recovery (T05)

`src/test/wire/domainEventRecovery.integration.test.ts` runs the same scenario
for SQLite and MySQL, with independent child processes and a private JetStream
container. It kills the producer after SQL commit, kills the relay after broker
ACK but before completion, publishes a duplicate reference under a fresh
transport ID, projects a 1.1 MB SQL payload, pauses an HTTP sender while a
successor completes, and stops/restarts the broker while committed work waits.
It asserts stable identities, one audit row per source, signed requests,
unchanged successor state and graceful worker shutdown.

Lease expiry uses a controlled clock advanced by 61 seconds, rather than a
real one-minute wait. Broker outage and process signals are real. The fixture
does not establish production throughput or the 1,000-agent target.

Prerequisites: the local Docker socket `/var/run/docker.sock`, an already
available `nats:2.10-alpine` image, and MySQL credentials able to create/drop
generated `tasker_recovery_*` schemas. The test never resets a configured
application database; it cleans only its own schema, container and directory.
It uses `--pull=never` so a missing broker image fails explicitly. Both flags
are required for both dialects:

```sh
TASKER_REAL_INTEGRATION=1 TASKER_MYSQL_INTEGRATION=1 \
  bun test apps/backend/src/test/wire/domainEventRecovery.integration.test.ts
```

Set DB_HOST/DB_USER/DB_PASSWORD without printing secrets. With only the first
flag, SQLite runs and MySQL skips; without either, both explicitly skip.
Required automated CI provisioning remains M49. The test first failed because
the actual audit consumer ignored custom DB_PATH; restoring the old setup
reproduces the missing SQL projection. T03/T04/T06 fault checks separately
prove the lease, identity and timeout guards.
