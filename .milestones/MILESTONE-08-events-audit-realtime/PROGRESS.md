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

### M08-T04 — actor on every event

Stamped in `withRequestCorrelation`, beside the requestId it already injects,
rather than at the ~50 publish sites. One place means a handler cannot
forget, and a forgotten actor is worse than it sounds: the trail records that
event as unattributed, indistinguishable from something the system did on its
own.

The request context is opened by the logging interceptor, which knows only a
session user id — it runs before a database handle exists. `setRequestActor`
lets the session interceptor fill in the full principal a moment later, on the
context object already in flight.

A payload that already names an actor keeps it: a handler acting *on behalf
of* someone else is telling the truth about the subject.

### M08-T05/T06 — listAuditEvents and the trail view

Landed together because `gui:rpc-coverage` refuses contract surface the GUI
never calls. Read-only by construction — one method, no mutation, because the
trail is written solely by the projector. Gated on the existing `org:admin`
rather than a new `audit:*` family that would need seeding everywhere.

A third section under Organizations & Settings: filter by event and by actor,
virtualized, `domain.` prefix stripped, `system` actors labelled rather than
left blank.

Three gaps found while building: `executePaginatedQuery` defaults its sort to
`createdAt` and this table has `occurredAt` (`defaultSort` exists for exactly
that, and its doc comment names the resulting error); the TypeSpec does not
emit services, so `buf` generates from the checked-in `.proto` and both need
updating; and a query-error test can fail on an unhandled rejection from an
*earlier* test's still-mounted query unless the mock has a resolved fallback
behind the rejection.

### M08-T07/T08/T09/T10 — the live feed

Landed together, for the same reason T05/T06 did: `gui:rpc-coverage` refuses
contract surface the GUI never calls, and a reconnecting subscription with a
status indicator is one thing, not four.

**T07 — the endpoint.** `EventService.SubscribeEvents`, server-streaming over
the same `domain.>` subjects the projector consumes — but through core NATS,
not a JetStream consumer. The two want opposite things: the projector must
never lose an event, this feed would rather drop than block, because a browser
tab that fell behind wants current state and not a backlog.

Authorization lives in `eventScope.ts`, apart from the streaming plumbing, so
the rules are testable without a broker or a socket. Three of them: an event
with no org is never delivered; membership is the ceiling regardless of what
the client asked for; the client's narrowing applies underneath. Asking for an
org you do not belong to yields nothing rather than an error — the answer is
the same either way, and an error would confirm the org exists.

Re-authorization is by watching the stream, as decided below: a
`domain.org.member_*` event flowing through re-resolves the connection's org
set before the delivery decision, so a removal is exactly the message that
cannot slip through under the stale answer.

Two control frames, `stream.ready` and `stream.heartbeat`, distinguishable by
prefix from every `domain.` subject. They exist because an opened stream that
has yielded nothing is indistinguishable from one whose server is wedged — the
T10 indicator would have claimed "live" for a dead feed — and because
idle-timeout proxies cut connections that say nothing.

**T08 — targeted invalidation.** `eventQueryKeys.ts` maps a subject to the
query keys it makes stale, keyed on the entity segment rather than all 80
subjects: created/updated/archived/restored/purged all mean "the list you hold
is wrong". Two subjects drop the whole cache (a retention sweep and an org
purge, whose blast radius genuinely is everything); an entity the map has
never heard of narrows to the audit trail rather than falling back to
everything, so a new publisher costs a missed refresh and not a stampede.

**T09 — reconnect.** Exponential backoff from 1s to 30s, and polling only
after three consecutive failures. Falling back on the first drop would make
every deploy briefly turn the app into exactly the timer-based refreshing this
feed exists to remove. The poll stops the moment the stream returns.

**T10 — the indicator.** One `useLiveEvents` in `AppShell`, its status passed
to a presentational `LiveStatusIndicator` in both the mobile header and the
desktop rail — a hook in the component would open a stream per placement. Live
is a bare dot; the unhappy states earn a word. Offline reads "Refreshing
periodically", because polling is still updating the screen and "offline"
alone would suggest the data had stopped being true.

**The bug this uncovered, which was not in the new code.** Verified against
the real broker, a task creation produced no event on the feed at all. A task
row carries a `projectId` and no `orgId`, so `domain.task.*` — the
highest-traffic subject in the system — was published with no tenant on it.
The feed refuses to deliver an event it cannot attribute, which was correct
and made the gap visible; the audit trail from T03/T05 had been quietly
swallowing the same events for days, filing them under a null org where
`listAuditEvents(orgId)` could never find them again.

Fixed where T04 put the actor: one injection point rather than fifty publish
sites. `setRequestOrg` records the org on the request context, called from the
authorization check — the one place that already knows the answer, since
`can()` resolves a project's owning org anyway and `authorizePrincipal` takes
the org as a parameter. `withRequestCorrelation` stamps it on, only when the
payload does not already name one.

Verified end to end against NATS and the running consumer: a second user in no
shared org received only the ready frame while the owner received
`domain.task.created` carrying both org and project; the audit trail, which
recorded nothing for task events before the fix, records them against the
right org after it.

### M08-T11 — the whole chain, against a real broker

`realtime.integration.test.ts` stubs none of the hops: a real `createTask`
through a real NATS connection, into a real subscription *and* through
JetStream into a real `audit_log` row. Every other test in this milestone
stubs one of them, and both bugs the milestone actually hit — the wrapper that
ate the connection's prototype, and events published with no tenant — were
invisible to anything that did.

Gated on `TASKER_REAL_INTEGRATION=1`, the same switch the GitHub integration
test uses, and split into its own moon task and CI job: it needs a broker, not
a token, and CI can simply start a broker. That job runs on forks, which is
where most of the value is.

Two things worth recording from writing it. Racing `iter.next()` against a
timeout deadlocks the generator on cleanup — the losing `next()` stays pending
and `return()` queues behind a promise that never settles — so the helper
counts frames instead, which the heartbeat makes a usable clock. And the
consumer is created with `deliver_policy: new`: the shared stream holds every
event the broker has ever seen, and replaying them buries the test's own.

Revert-and-confirm-fail: with the org injection disabled, it fails in 9s on
"expected not null" rather than hanging.

## Remaining

Nothing. Every task and every exit criterion is met; T11 was the last.

## T07 authorization — decided

Authorize at connect, then re-validate the connection's org set when a
`domain.org.member_*` event flows through the stream it is already subscribed
to. Cheap in the common case, and self-correcting on revocation: the event
system polices itself rather than paying a policy check on every message.
Per-event re-authorization is stricter but costs a `can()` call per message
per connection, which is the wrong trade for a feed whose whole point is
volume.

## Also found, not fixed

The backend has ~35 pre-existing type errors and no `typecheck` task (the GUI
has one), so `moon check --all` cannot see them. 25 are in one test file.
Worth its own round.
