# Recovery and backup operations

This runbook describes the implemented SQL source, relay, durable consumers,
schedule receipts and webhook queue. It does not promise automatic disaster
recovery across arbitrary database, broker or application versions.
See [architecture](../.specs/product/architecture.md),
[webhooks](webhooks.md) and [measured limits](performance.md).

## Identify the failing boundary

A successful API mutation means its SQL transaction committed. It does not
mean a broker publish, audit projection or external webhook receiver finished.

| Boundary | Evidence | Meaning |
| --- | --- | --- |
| Source transaction | Canonical task and `domain_events` row | Durable application intent exists |
| Producer relay | Source `delivered_at` after JetStream publish ACK | Broker accepted this source event |
| Audit consumer | Stable producer identity in audit SQL and consumer ACK progress | Projection committed and consumption progressed |
| Webhook receiver | Delivery status and receiver's own deduplicated effect | External delivery succeeded |
| Schedule occurrence | `schedule_runs` receipt and canonical task | This occurrence's recorded outcome |

Readiness indicates the API's lifecycle readiness. It is not a complete
end-to-end recovery probe. Liveness is not proof that pending work drained.
Inspect these boundaries separately and retain fixed labels, IDs and counts;
do not copy event payloads, tokens, encrypted secrets or SQL backups into logs.

Use a read-only database connection for initial inspection:

```sql
SELECT id, delivered_at, attempts, next_attempt_at, claimed_until
FROM domain_events
WHERE delivered_at IS NULL
ORDER BY created_at, id
LIMIT 100;

SELECT id, schedule_id, outcome, task_id, claimed_until, next_attempt_at
FROM schedule_runs
WHERE outcome IN ('queued', 'running', 'interrupted')
ORDER BY ran_at, id
LIMIT 100;
```

SQLite timestamp columns in these schemas store Unix **seconds**. MySQL uses
timestamp columns; set/record the client session time zone before comparing
times. Do not interpret SQLite seconds as milliseconds. Exclude schedule
frozen inputs and actor snapshots from incident exports.

## Recover pending events and interrupted work

1. Verify the configured database, broker address, stream/consumer and
   encryption configuration refer to the intended installation. Resolve the
   underlying connectivity, disk, authorization or schema problem first.
2. Restart the same compatible application against those resources. Pending
   SQL source rows are retried; an expired producer lease can be reclaimed.
   Broker ACK precedes the source's delivered marker. A crash between those
   operations can republish the same logical producer identity.
3. Observe pending counts, oldest age, producer acknowledgements and consumer
   progress. Require canonical task/source/audit identity reconciliation,
   rather than inferring success from a quiet application log.
4. For schedules, retain the existing occurrence receipt. Queued/interrupted
   work becomes eligible at its retry time; running work can be reclaimed
   after its 60-second lease expires. Retries use bounded backoff (initially
   five seconds, capped at five minutes). Stale lease owners are fenced.
   Inspect the resulting receipt and canonical task before taking action.
5. Inspect webhook delivery state separately. An audit replay does not
   recreate the original webhook fan-out. A timed-out receiver may already
   have committed its effect; receivers must deduplicate the delivery ID.

Do not clear live leases, delete receipts, advance production clocks or change
IDs to force progress. A fresh manual schedule run creates a **new intent**;
it is not recovery of the old occurrence. Tests use controlled clocks to
exercise expiry without changing production time.

SQL delivered-source retention is 14 days; pending source rows are not
pruned merely because they are old. The current broker retention is seven
days; audit consumer ACK wait is 30 seconds with five maximum deliveries.
These are separate horizons, not an unlimited replay guarantee. Check the
actual installed configuration when investigating an older deployment.

For a bounded diagnostic replay, retain the original producer ID/reference
and fetch its authoritative SQL source. The transport message ID can be
fresh so the broker accepts the replay; the logical identity must remain
stable. Never fabricate a payload, reuse an unrelated event ID or treat
duplicate audit insertion as success. Exhausted delivery or missing retained
source requires incident-specific reconciliation, not an invented event.

## Establish a consistent backup boundary

1. Record the application revision, SQL engine version, migration state,
   broker configuration and protected secret references.
2. Quiesce ingress and **all** SQL writers: every API replica, scheduler,
   relay, webhook worker and audit consumer. Ensure none can reconnect while
   taking/restoring the snapshot.
3. Preserve the application encryption secret required to decrypt webhook
   signing secrets. Store backups and secret references under restricted
   permissions in separate protected storage. Backups contain confidential
   account data, token hashes, events and receiver configuration.
4. Coordinate SQL and JetStream durable-volume snapshots at the same
   quiescent cut. Record any source backlog and consumer checkpoint.
   Do not assume a newer consumer ACK state will reconstruct projections
   missing from an older SQL backup.
5. Restore into an isolated environment first. Use the compatible binary,
   migration set and broker configuration recorded with the backup.

An older SQL restore can resurrect revoked credentials or memberships.
Reconcile authorization changes and rotate affected credentials before
reopening ingress. Preserve decryption keys when rotating session credentials;
they have different purposes. External webhook side effects cannot be rolled
back by restoring Tasker's database.

## SQLite backup and restore

With every writer stopped, checkpoint the owned database:

```sql
PRAGMA wal_checkpoint(TRUNCATE);
```

Require the checkpoint's busy result to be zero. Close the database handle,
then copy the database file into private backup storage. Alternatively,
preserve the database, WAL and SHM files together as one offline bundle;
do not mix files from different snapshots. Never copy only a live main file
and assume its WAL was included.

Restore while all handles remain closed. Keep the current installation as
a separate recoverable copy, restore the complete selected snapshot, then
start the matching application in isolation. Check canonical IDs, pending
source IDs, delivery IDs and decryptability before enabling workers/ingress.
Do not let a diagnostic client silently create an empty database at a
mistyped path.

The committed fixture checkpoints/closes its exclusively owned SQLite file,
copies it privately, removes the original, restores it and opens the normal
database setup. It compares exact IDs and hashes before continuing real
producer, audit and webhook recovery.

## MySQL backup and restore

Use the existing compatible MySQL client or the deployed MySQL image's
tools. Configure credentials in a protected client option file; do not put
passwords into command arguments, terminal history or CI logs. For an owned,
quiesced InnoDB schema, the command shape is:

```sh
umask 077
mysqldump --defaults-extra-file=/protected/tasker-client.cnf \
  --single-transaction --routines --events --triggers \
  --no-tablespaces --set-gtid-purged=OFF OWNED_SCHEMA > /protected/tasker.sql
mysql --defaults-extra-file=/protected/tasker-client.cnf \
  FRESH_EMPTY_RESTORE_SCHEMA < /protected/tasker.sql
```

Create the fresh restore schema deliberately with the installation's
character set/collation. Verify all expected tables, migrations, source and
receipt identities before selecting it in application configuration. Do not
drop or overwrite an existing installation as part of a trial restore.
The single-transaction option does not make concurrent schema changes safe.

The fixture uses the already provisioned MySQL8.0/8.4 service container's
dump/client tools, receives that container's explicit owned ID, and restores
into a second UUID schema. Private SQL stays in a temporary directory and is
removed; it is never printed or uploaded. Original and restored schema
creation are tracked independently for cleanup.

## Verify the restored installation

Before reopening ingress:

- Compare canonical task IDs, event IDs/payload hashes and delivery IDs.
  Verify webhook secret decryptability without printing the secret.
- Let pending sources receive actual broker ACKs, then verify stable audit
  identities and consumer progress. Confirm duplicates do not add audit rows.
- Inspect interrupted/expired schedule receipts through recovery and verify
  their canonical result. Do not create a second occurrence to make a
  missing first result disappear.
- Exercise signed webhook delivery against an owned receiver that records
  delivery IDs. Confirm pending queues drain and failures remain visible.
- Restart/reconnect the owned broker and verify recovery separately from
  normal request throughput. Check cleanup and resource ownership.

The producer-aware audit migration permits stable logical identities across
broker replays. Reinstating the former broker-sequence uniqueness constraint
can conflict with valid replay history. Rollback requires a compatible binary
and tested backup; do not blindly recreate the old unique index.

## Reproduce the disposable rehearsal

Use a Linux test runner with Docker, the repository's pinned Bun toolchain
and frozen dependencies. Provision the same isolated MySQL service as CI and
pre-pull the declared NATS image. Supply only disposable database credentials
and the explicitly owned service container ID in
`TASKER_MYSQL_SERVICE_CONTAINER`; the runner creates its own UUID schemas.

From `apps/backend`:

```sh
bun run test:recovery:mysql
bun run test:recovery:backup-proof
```

The required MySQL command executes every enabled real recovery counterpart,
including pending-source restore and expired/interrupted occurrence cases.
SQLite/NATS counterparts execute in integration CI. The backup fault command
temporarily replaces the owned SQLite restore with an empty file. It requires
an actual empty restored database and failure of the exact task-identity
assertion, rejects setup/timeout/cleanup failures, and restores source bytes.

This demonstrates the committed disposable scenarios. It does not validate
arbitrary cross-version restores, an untested production backup, permanent
exactly-once delivery or healthy 1000-caller capacity. Candidate hosted
verification and exact results are recorded in the M50 progress journal.
