---
id: ADR-0047
status: accepted
date: 2026-11-09
milestone: M53
---

# Resolve navigation from authorized ownership and page actionable work separately

## Context

ADR-0025 records scope in the URL, but a queue/search link can carry the wrong
project or no scope. Existing scope-switch effects then close a resolving entity.
GetTask returns projectId but not organization; GetArtifact returns only folderId,
so canonical ownership cannot be recovered with a bounded existing folder read.
Task question/approval panels sort only one capped all-status page. Older open
items disappear, and organization queues discard the next cursor after 50 rows.

## Options

1. Trust incoming scope/current selectors and sort a larger all-status page.
   This retains wrong ownership and moves the pending-work cutoff rather than
   removing it. Searching every project/folder to locate an artifact is unbounded.
2. Add a universal resolver plus new pending/history RPCs. This works but creates
   another public authorization surface and duplicates existing bounded readers.
3. Extend existing authorized response metadata and list selectors, and retain
   their current authentication, pagination, projections and defaults.

## Decision

Choose option 3. Keep existing routes, ADR-0025 URL state and the single scoped stream.
After successful current authorization, resource ownership normalizes the same
navigation entry with replace; initial user navigation is a push. Resolution
must not be mistaken for a deliberate selector change or close the resource.
Failed/stale resolutions never rewrite a newer route or expose owner metadata.

Compatible response additions, rechecked against current numbered fields:

- GetTaskResponse optional orgId at fresh field 3 (field 2 is latestHandoffNote).
  Task.projectId remains authoritative. Return metadata after tasks:read checks.
- GetArtifactResponse optional orgId2/projectId3, derived from the authorized
  artifact's actual folder/project. Do not return artifact bodies or require an
  additional projects:read permission merely to recover an allowed resource.
- Existing clients ignore additions. Current GUI handles absent metadata with a
  bounded authorized known-owner fallback where available, otherwise a retryable
  ownership-resolution error. Never guess, scan all projects, or claim readiness.
- Belief already exposes orgId/scopeType/scopeId; reuse those authorized fields.

Add `closed` to the existing list-only status selector strings, preserving
current defaults and every existing value. Questions closed = answered/cancelled;
approvals closed = approved/rejected/stale. This is not a stored row status.
Apply the finite SQL status predicate before cursor paging and counting, inside
existing org/task authorization scope. Bind cursor position as well as count identity to the endpoint, authorized
org/task, selector, filter and sort/direction. Existing extraCacheKey only guards
count reuse and must not be mistaken for position binding. Add a narrow opt-in
to the shared pagination helper so unrelated lists keep their behavior. New
bound cursors reused for another rowset/order fail InvalidArgument with generic
restart guidance; legacy unbound cursors restart from the authorized first page
with a fresh count rather than skipping rows. Newly emitted cursors are bound.
Expose closed in MCP list-selector enums as well as the backend/GUI. No new list-selector field numbers, tables, migration or grants. Existing
mutation semantics remain except correcting any verified stale-decision rollback: a
real interceptor/wire test must prove that a stale approval is durably closed
while preserving its existing failure response and atomic normal decisions.

GUI task panels query pending and closed history independently through bounded
infinite queries; organization queues query pending pages. Keep PageResponse,
local next-page errors, deduped IDs and source reconciliation. Never filter a
capped all-status page to simulate complete history or pending work.

## Consequences and verification

The response boundary grows by three optional metadata fields; schema/proto/TS/Go
and compatibility/wire tests must agree. Both SQL dialects must prove authorized
metadata and closed selectors, paging, counts and tenant exclusion. New client
versus legacy metadata absence fails honestly rather than inferring ownership.
Task summary draft protection is local UI intent, documented in the UX plan;
it adds no persistent server model. Full browser/fault/coverage review remains
required before implementation tasks close.
