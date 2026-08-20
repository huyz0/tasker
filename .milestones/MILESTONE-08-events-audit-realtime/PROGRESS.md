# M08 — Progress

Started 2026-08-20. Task-by-task, each verified against a real broker rather
than a mock, and merged separately.

## Done

### M08-T01 — NATS in the local stack

NATS 2.10 + JetStream in `docker-compose.yml` (named volume, healthcheck);
`scripts/dev.sh` starts it opportunistically and says whether it got it.
JetStream rather than core NATS because T02's consumer must survive being
down, which core's fire-and-forget delivery cannot support.

**Found a latent bug.** `withRequestCorrelation` returned `{...nc, publish}`,
and spreading a NATS connection drops every prototype method — `isClosed`,
`flush`, `drain`, `subscribe`, `jetstream`. Invisible for the life of the
repo because with no broker `nc` was always null and the health probe
short-circuited on `!nc`. The moment a broker existed, Ping 500'd. Replaced
with a Proxy. The pre-existing tests could not have caught it: they use an
object *literal* as the fake connection, where every method is an own
property and spreading works. New tests use a prototype-based fake.

Verified: Ping returns `natsStatus: "connected"`, `natsLatencyMs: 3` — a real
flush() round-trip.

### M08-T02 — Durable consumer

Separate entrypoint (`moon run backend:consumer`), not a task inside the API:
the two scale on different signals, and an API restart must not drop a
partly-processed batch. Durability decisions live in `consumers/stream.ts` so
they are assertable without a broker; the entrypoint is signals and exit codes
and is coverage-excluded.

Durable (named) consumer, `ack_policy: explicit`, `deliver_policy: all`,
`max_deliver: 5`, 7-day `max_age`. Setup is idempotent, and `ensureConsumer`
deliberately does not re-add an existing consumer — that would reset the ack
position, which is the thing making it durable. Shutdown drains rather than
closes, so a deploy does not turn in-flight messages into duplicates.

Verified against the broker, which is the task's own bar: stopped consuming,
published 3 events, confirmed JetStream held 3 pending, restarted, received
all 3 in order.

### M08-T03 — audit_log + projector

Table in both engines, migrations journalled, projector wired into the
consumer. Payload stored verbatim (twenty-plus subjects with differing
shapes); `actorType` explicit so "system did this" and "unattributed" stay
distinguishable; `orgId` nullable for events that precede org membership;
`stream_seq` unique so an at-least-once redelivery is a no-op. Acks only
after the write.

**Two problems found only by running it.** `setupDatabase` takes its driver as
an argument and defaults to mysql — the consumer called it bare and silently
wrote to the wrong database in standalone mode. And drizzle applies only
migrations listed in `meta/_journal.json`, so hand-written SQL is invisible
until registered; verified by deleting `.data/` and re-applying the chain.

Verified: a real `domain.org.member_role_updated` produced exactly one row
naming the actor (`user`/`usr-admin-1`, org and requestId carried through);
replaying it returned `duplicate` and left one row.

## Remaining

T04 actor on every payload · T05 `listAuditEvents` · T06 audit UI ·
T07 streaming endpoint · T08 client subscription · T09 reconnect/fallback ·
T10 connection indicator · (+1)

## Open question for the next session

T07 needs a decision that is not mine to make unilaterally: how a streaming
connection is authorized and scoped. The exit criterion says a user receives
only events for organizations they belong to, which means either
re-authorizing per event or pinning the subscription's scope at connect and
tearing it down when membership changes. The second is cheaper and the first
is safer.

## Also found, not fixed

The backend has ~35 pre-existing type errors and no `typecheck` task (the GUI
has one), so `moon check --all` cannot see them. 25 are in one test file.
Worth its own round.
