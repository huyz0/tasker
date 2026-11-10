# M55-T05 supervision and severed-stream coverage review v9

- **Date**: 2026-11-10
- **Reviewer**: independent existing human_workflows_review agent
- **Decision**: changes required for owned harness cleanup
- **Scope**: attention-stream-gate.ts, appended severed-stream browser journey,
  attention-supervision.spec.ts and Attention documentation; no implementation edits

## Blocking finding — setup and observer failure can leak owned resources

In attention-source-actions.spec.ts the severed-stream journey allocates the
proxy before native login, observeOrgEvents and route installation, but enters
try/finally only afterward. A failure in those setup operations leaves the
listening proxy without cleanup. observeOrgEvents similarly awaits stream.ready
before returning its close handle; a readiness timeout or reader/parser failure
can leave the native subscription open. Its reader may reject before a caller
awaits close. Finally, awaiting observer.close before gate.close allows an
observer read failure to skip proxy closure.

Enclose all setup after proxy allocation in an outer try/finally, retain an
optional observer handle, and guarantee proxy closure in a nested finally.
The observer should own abort/reader cleanup on startup failure and safely
propagate reader failure to its readiness/subject waiter. Exercise at least
observer readiness failure and teardown reader failure, proving that the proxy
and native subscription are closed even though the browser test fails.

## Documentation corrections

Load more reaches remaining rows beyond the first20, rather than older rows:
the selector deliberately orders oldest-first. An initial failed read leaves
count unknown; a failed refresh retains its last authorized count with stale
copy. docs/attention.md should distinguish these states.

## Otherwise sound boundaries

The proxy cuts only owned browser event streams and gates reconnect while the
native observer confirms an actual organization-owned publication. Releasing
the gate and requiring source appearance within5s/under14s from opening excludes
the15s poll; the reported deliberate reconnect fault is relevant evidence.
Native cookies stay in test-process memory. The supervision journey is explicitly
gated to the owned manifest, bounds traversal, verifies all four source groups
beyond50, opens canonical task links and inspects current source state after
existing contextual actions. No new resolution semantics or stale release fence
is claimed. The observer/proxy test helpers need the cleanup correction before
source approval. Full gates, final supervision retry and final-head CI remain
pending; reported browser/fault runs were not independently rerun here. Previous
CODE/UX records are preserved.
