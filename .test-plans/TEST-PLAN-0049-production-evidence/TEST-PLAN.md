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
