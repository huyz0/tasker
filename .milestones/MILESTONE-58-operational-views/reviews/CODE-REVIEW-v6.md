---
timestamp: 2026-11-10T21:23:07Z
decision: approved
---

# M58-T02 saved definition persistence four-lens review

Independent source review covers the owned T02 implementation against accepted
ADR0044, ARCH-v2, UX-v7 and TC005a–d/006a. Reviewed views handler/definition/native
tests, schemas/migrations, managed purge and mutation registration, TypeSpec/
additive protobuf/generated bindings, staged GUI exceptions and actual wire
test. Published T01/T05 changes are separate and are not findings. Ledger paths
and heavy-task rules were checked; API/security standards apply. Only this new
review record was written. No implementation, tests, services or browser were
changed or run by this reviewer.

## Correctness

Definition validation is strict, versioned and limited to existing task/report
controls. It removes protobuf runtime tags without persisting them, preserves
absent priority versus0 and false/default presence, and refuses contradictory
screen/query or unsupported payloads. Names are trimmed/NFC-normalized, bounded
and keyed by a lowercased digest; DB uniqueness protects each actual audience/
creator/screen namespace in both dialects. Rename changes only name/key/time.
Owner, tenant, project, audience and stored query remain immutable.

Create derives org from an active project and owner from a required human.
Get checks audience/org access before exposing reference failure, validates the
stored active same-org project/definition and earns actual source-read rights
before returning a query. Rename/Delete retain authorized cleanup of obsolete
references. Their current locking read inside the runtime write unit prevents
acknowledging a stale rename after concurrent removal. Duplicate-name mapping
matches the relevant constraint instead of converting arbitrary DB failures.

List applies tenant/screen/current personal-or-shared predicates in SQL before
limit/count. Optional audience, principal, tenant and screen bind the cursor;
the shared builder additionally binds filter and sort. Selected internal
definition JSON is used only to validate unavailable metadata and is not sent
in catalog responses. Page size remains bounded. A single bounded project
lookup avoids per-row metadata fetches. Optional names are withheld without
org-level project:read; explicit single Get/Create can check a narrower project
grant. Omitting an optional list name is conservative, not a grant of access.

## Architecture and lifecycle

The implementation matches the accepted human-only configuration service and
uses actual org:admin policy resolution for shared changes. Tasks uses existing
organization task:read; Reports uses project dashboard:read. Audience metadata
does not replace fresh Open authorization or ordinary subsequent source reads.
No private query/name business event is emitted. Local UI integration remains
T03 with explicit temporary reachability exceptions, not a claimed finished UI.

Both migrations are additive, retain a real org/owner reference and deliberately
avoid project cascade so obsolete entries survive for cleanup. Managed org
purge deletes saved definitions before removing the tenant, including entries
whose projects are already gone. Runtime service registration and read-inventory
additions keep Get/List out of write units while mutations use existing units.
No dependency, new scope vocabulary or arbitrary query language is introduced.
New contract messages/RPCs append without changing existing fields/numbers;
optional scalar presence is retained in TypeSpec/protobuf/generated clients.

## Security

Every operation requires a human before validation; agents cannot become bookmark
owners. Personal audience checks precede project/query failure details, including
admin ID guesses. Wrong/unknown/foreign-private IDs use a generic NotFound.
Shared editability is freshly computed and server policy is checked again on
write, including former-admin creators. Project names honor their separate
metadata permission. Invalid/obsolete Get returns no definition, source-read
revocation refuses it, and creator ownership cannot bypass lost org access.
No runtime data leak or authorization bypass was identified.

## Coverage and remaining gates

Reviewed tests cover private guesses/list counts, server-derived identity,
viewers' personal configuration, shared admin revocation, ordinary source and
project-name rights, strict input/defaults, real codec presence, normalized
concurrent names, bounded mixed-audience pages/cursors, obsolete cleanup,
invalid stored definitions, tenant purge and no durable private events. Native
MySQL tests add real uniqueness races, p95 timing and concurrent rename/delete
serialization. Populated upgrade tests pin the historical migration boundary
and preserve existing work across repeat boots. The real auth/socket test uses
two same-org people plus a foreign principal and actual generated clients to
verify presence, privacy, sharing, revoked administration and obsolete cleanup.

Parent reports175 affected/510 assertions, both populated dialect upgrades and
four MySQL core/race cases passing, native fixture p95109.67ms, six restored
behavioral faults failing as intended, old450-message/1314-field/187-method
compatibility plus18 binary roundtrips, actual socket12/72 with one independent
existing optional skip, and backend types passing. These runs were not
independently rerun. No blocking source finding identified. Full36, closure,
base reconciliation and actual final-head publication gates remain pending and
are not established by this source approval or previous T01/T05 CI.

```yaml
findings: []
```
