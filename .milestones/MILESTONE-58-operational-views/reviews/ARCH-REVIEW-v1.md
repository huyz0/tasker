---
timestamp: 2026-11-10T20:06:16Z
decision: rejected
---

# M58-T02 named definitions static architecture review

Independent four-lens design review compares proposed ADR0044, named-view UX and
TC005a–d with current policy/authz, Tasks/Reports readers, cursorScope query
builder and managed purge code. Ledger and heavy-task review rules were read.
No runtime implementation exists for T02. Only new review records were written;
no production/design/journal files, services or tests were changed.

## Correctness and architecture

Typed supported query definitions, server-derived org/creator, immutable
audience/project/query and Save-as-new provide a coherent bounded alternative
to arbitrary URLs or implicit overwrites. Personal creator-only access precedes
reference failures; org:admin uses real policy resolution rather than literal
roles. Fresh Get before explicit Open and source authorization afterward keep
a bookmark distinct from an access grant. Tasks uses org task:read and Reports
uses project dashboard:read, matching current handlers. Agent ownership is not
introduced. Current URL intent remains authoritative while metadata loads.

SQL privacy predicates before limit/count, explicit selected metadata, stable
scoped cursors and bounded batches fit the existing query builder. Name
uniqueness needs canonical keys with identical both-dialect behavior plus a DB
constraint; the planned native concurrency proof is appropriate. Keeping an
obsolete project reference for cleanup while removing definitions atomically on
org purge fits the existing managed cascade boundary. No new event broadcast
of private configurations is necessary.

## Security boundary requiring clarification

ADR metadata is audience-readable, but the proposed enrichment also fetches
project context without explicitly retaining the resource's own metadata
permission. Current projects.handler.ts:149 checks project:read at project
scope and listProjects:233 checks it at organization scope; org:read is not
equivalent under custom grants. A reader may be allowed to see a shared saved
name yet lack permission to read that project's current name. The design must
state whether project metadata enrichment earns project:read (or a deliberate
documented narrower contract), and provide a truthful generic fallback when it
does not. Do not silently widen current project metadata visibility through a
saved-view list. This is a proposed-boundary gap, not an observed runtime leak.

## Coverage

TC005a–d covers private-ID guesses including admins, derived ownership, shared
revocation, strict definitions, active/obsolete refs, bounded privacy/count,
uniqueness races, purge, migrations and old-client compatibility. Add an
executable custom-grant case: org:read can list declared-audience configuration
metadata but cannot obtain unauthorized current project names; source-read loss
still prevents Get returning a query. Conversely authorized metadata context
must remain useful. Include explicit grant/ancestor admin paths when testing
the promised reuse of actual policy.

The named dialog's complete bounded paging UX also needs the companion UX-v6
amendment. Runtime TDD, both dialects, wire, rendered and final gates remain
future proof. T01's hosted CI/main status is independent of this static verdict.

```yaml
findings:
  - file: .specs/adr/ADR-0044-saved-view-ownership.md
    line: 106
    severity: Medium
    comment: >-
      Specify the authorization boundary for batched current project metadata
      enrichment. Shared saved-view audience/org:read does not imply the
      project's actual project:read permission (projects.handler.ts:149/233).
      Gate current projectName/context accordingly or document an intentional
      contract with a truthful generic fallback; add custom-grant tests that
      distinguish configuration metadata, project metadata and fresh source
      query access. No runtime leak is asserted before implementation.
```
