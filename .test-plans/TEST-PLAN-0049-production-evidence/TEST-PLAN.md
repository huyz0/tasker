# Production evidence acceptance plan

## Scope and prerequisites

M49 verifies existing runtime behavior using disposable MySQL schemas, owned
JetStream brokers and real processes. It adds no new permissions or execution
engine. M49-T01 already supplies explicit uncached native MySQL commands; its
required current-source publication gate remains separate.

## M49-T02 scenarios

1. Boot two distinct API PIDs and an audit consumer against one generated MySQL
   schema and a new owned broker. Migrate before starting contention, use
   ephemeral HTTP ports, and authenticate real sessions and scoped agent tokens.
2. Concurrent claims through different API processes produce one winning claim
   and one persisted assignment. A keyed create retried through the other API
   returns the same task/display identity and has one source record.
3. Observe the committed source event, the broker publication acknowledgement
   and consumer acknowledgement. Republish its bounded reference with a new
   broker message identity; exactly one audit row remains for the logical task,
   retaining its stable producer ID.
4. A member positively receives a real task event, disconnects, then loses
   organization membership. Their session identity remains valid, canonical
   source reads are denied, and a reconnected scoped feed emits no unauthorized
   domain event through a heartbeat after a live owner-controlled mutation.
5. Run the existing atomic/event/schedule recovery cases with both SQL flags.
   Preserve exact receipt/task identities through process death, expired leases,
   frozen inputs and generic idempotency cleanup. Required recovery runs must
   execute cases with no silently skipped dialect counterpart.
6. A temporary dropped task-audit insert must produce a specific lost-outcome
   failure after consumer acknowledgement. A temporary regenerated audit identity
   must produce a specific duplicate-outcome failure. Bootstrap/transport errors
   cannot satisfy either proof. Restore source bytes in finally.

## Fixture and verification rules

Generate schema/container names internally; never clean a caller's deployment.
Do not share a production broker or its durable consumer. Track and stop only
owned PIDs, abort streams before shutdown, close connections and remove only
created resources. Credentials stay in process memory, outside artifacts.

Keep bounded readiness, unary, stream and test watchdogs. The existing
25-second heartbeat is observed without changing runtime settings. Steady
query budgets remain unchanged. Preserve failure logs and actual hosted
results; source approval does not substitute for final-head CI.

Load harnesses, staged caller counts, hardware/capacity limits and release
toolchain consolidation remain M49-T03–T05 and require their own actual results.

## M49-T03 bounded load acceptance

1. Given invalid, unknown, repeated or unbounded CLI dimensions, reject before
   opening SQL, starting a process or allocating fixture data. Accept only
   concurrency1–1000, duration1–120seconds, fixture0–10000tasks, instances1–4,
   a uint32 seed and at most50000 logical operations. No deployment URL/schema
   may be supplied; generate all writable resources internally.
2. Given observed completion times, report nearest-rank p50/p95/p99 and sample
   counts for all completions and successful logical operations separately.
   Empty samples report null, never zero latency. Preserve input observations.
3. Given attempted keys, acknowledged first-write IDs and independent SQL rows,
   fail absent acknowledged writes, duplicate logical rows, changed identity
   and unattempted rows. Distinguish uncertain committed from uncertain absent
   writes. Test the lost/duplicate oracles before implementation.
4. Given a disposable MySQL schema and an owned broker, start the requested
   number of real API PIDs and a durable audit consumer. Seed only that schema;
   use one distinct scoped agent per caller. Each measured logical operation
   creates with a stable key, replays through another instance, then reads the
   canonical task. Production rate limits and database pools are retained.
5. Given the duration or operation cap is reached, stop admitting work, settle
   bounded requests and drain the owned APIs before final source reconciliation.
   Drain pending events separately; audit identity/counts and source outcomes
   must match. Cleanup failures and incomplete correctness checks fail the run.
6. Emit one machine-readable result with workload dimensions, actual elapsed
   time, operation and error-code counts, throughput, latency distributions,
   sampled own-process memory, hardware/cgroup limits, queue observations,
   correctness counts and actual runtime/MySQL/NATS versions. No credential,
   session, raw driver error, request body or event body appears in artifacts.
7. A small hosted smoke must complete without correctness violations and retain
   its JSON. T04 separately records100 and1000 caller experiments, any saturation
   and resource limits. No result implies20000 callers, every endpoint, steady
   long-duration load, multiple hosts or long-lived streaming capacity.

## Late SQL commit visibility

Given an owned fixture with a successful measured operation and stopped measured
API processes, open an independent SQL transaction at the final-oracle boundary
and insert an unattempted task under this run's measured title prefix.

When that transaction actually commits after a bounded delay, the final checker
must observe the persisted task and fail its unexpected-outcome assertion,
rather than report a valid result from an earlier snapshot.

Require a positive SQL-commit marker, a completed checked report with unexpected
outcome count above zero, exit1 and successful owned-resource cleanup. Bootstrap,
transport, timeout and cleanup errors cannot satisfy this proof. Restore the
temporary harness source byte-for-byte before any ordinary verification.
