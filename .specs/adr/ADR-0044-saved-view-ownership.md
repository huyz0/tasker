---
id: ADR-0044
status: accepted
date: 2026-11-10
milestone: M58
---

# Store named query definitions with explicit ownership

## Context

ADR0025 and M58-T01 make the current URL authoritative for supported Tasks and
Reports settings. People need names they can reopen across sessions, with
personal privacy and deliberate organization sharing. A bookmark does not grant
access to its referenced project or data. Current controls have no status/label
resource filter; the only resource reference is the project. Do not invent new
filters to satisfy a persistence abstraction.

Existing policy resolves human permissions through `can`/`assertCan`, including
explicit grants and ancestor organization roles. Tasks list reads currently check
organization `task:read`; project Reports checks project `dashboard:read`.
Organization administration already uses `org:admin`. These existing checks,
not a client flag or a literal role-name comparison, remain authoritative.

## Options

1. Browser-only named bookmarks are cheap but cannot provide account ownership,
   cross-device persistence or checked sharing.
2. Persist arbitrary URLs/JSON and let every member edit shared entries. This
   accepts unsupported state, hides reference validation and makes another
   person's saved configuration editable without an explicit policy.
3. Store a bounded versioned definition, immutable creator/tenant/project/
   audience and checked shared administration. This needs additive storage and
   RPCs, but names remain configuration rather than data or access rights.

## Decision

Use option3: store version1 supported definitions, personal by default, with
server-derived ownership and explicit organization administration for sharing.

### Authority and audience

- The service accepts authenticated humans, as Reports already does. Agent
  credentials do not become personal-view owners or expose human bookmarks.
- Create takes an existing active project reference, name, optional audience
  and typed definition. Derive its organization from that project and its
  creator from current credentials. Submitted owner/organization fields never
  supply stored identity. Require current `org:read` and the screen's existing
  data-read permission before creating or opening a definition.
- Personal entries are visible/editable only to their creator, even when
  another organization administrator guesses the ID. Existing ownership is
  checked before exposing reference/definition failures. Unknown, foreign,
  inaccessible and another person's private IDs fail with NotFound.
- Organization entries require `org:admin` to create, rename or delete. A
  creator who loses that permission also loses shared editing. Reuse existing
  grant/ancestor semantics; do not equate this to a client-supplied admin role.
- Audience, owner, organization, screen and project do not change after create.
  Sharing personal settings creates a new deliberately shared definition.
  Save creates a named definition; Rename changes its name only. No implicit
  overwrite or audience toggle is introduced.
- List takes an authorized organization and screen, returning only current
  user's personal and organization entries. Apply privacy/tenant predicates in
  SQL before pagination/count. Metadata is visible to its declared audience;
  query contents are returned only by a fresh, authorized Get. List never
  applies an entry or returns its search/filter payload.

### Definition and validation

- Typed additive contract messages cover version1, `tasks` or `reports`, and
  exactly one corresponding query. Append within the existing contract package
  without changing existing message fields/numbers or moving existing RPCs.
- Tasks support Board/Table, search up to500 characters without control
  characters, optional priority0–4, ready-only and the existing four sorts with
  asc/desc. Priority0 differs from absence; ID order is `createdAt`.
- Reports support7/30/90 days. Missing optional controls use the existing
  defaults. Reject unsupported versions, screens, fields, sorts, ranges,
  contradictory queries and oversized/control-character text. Generated codec
  metadata is removed before strict definition validation.
- Store canonical JSON of those validated values only. Never store arbitrary
  URLs, SQL, result rows, cursors, modal/draft/selection state or permissions.
- Create and Get validate current active project, matching stored organization,
  current ordinary data-read permission and allowed definition fields. A
  definition is never a capability. Source queries still authorize their own
  data after an explicit Open.
- Rename/Delete authorize the stored audience/owner and current organization;
  they can clean up a definition whose project is unavailable without reading
  its query or using the obsolete reference.

### Metadata, obsolete references and recovery

- Store ID, organization, project reference, creator, screen, audience, name,
  canonical definition, created/updated times and a server-derived uniqueness
  key. A project reference deliberately has no foreign-key cascade: obsolete
  entries remain discoverable for clear recovery. Organization purge removes
  its definitions transactionally; no tenant data survives its owning tenant.
- Rename/Delete use a current locked view row inside the existing runtime write
  unit, following the project's current-read pattern. A concurrent deletion
  cannot turn a snapshot into a false successful rename; serialization/conflict
  is preferable to acknowledging an operation on a row already removed.
- Names are trimmed, bounded at128 characters and reject control characters.
  Unicode-normalized/case-insensitive name keys have the same semantics in both
  SQL dialects. Names are unique per organization/screen/audience namespace;
  each personal creator has a separate namespace, while organization names are
  shared across creators. The DB unique constraint closes concurrent races.
- Lists are bounded through PageRequest/PageResponse, default50/cap100, with
  supported name/date sorting/filtering and cursor scope bound to the actual
  tenant/screen/current owner-visible rowset. Metadata includes current
  editability and an unavailable indication for missing/archived projects or
  incompatible persisted definitions, without returning the query.
- An optional validated audience selector permits independent Personal and
  Organization pages; absent selection still means the same authorized union,
  never another user's private entries. Bind audience selection into cursor
  identity. The dialog uses bounded Previous/Next pages per section, not an
  unbounded appended/fetch-all catalog.
- Project display names are project metadata, not automatically part of a
  shared definition's audience. Include them only when current project:read
  authorizes that metadata; otherwise return an optional-name omission and a
  generic context/unavailable indication. Org:read by itself must not expose a
  current project name. Source-query permission remains independently required
  by Create/Get. Check project/creator metadata in bounded batches and reuse
  policy caches rather than issuing repeated metadata reads per row. The
  existing150ms list-handler budget applies.
- Get returns FailedPrecondition for an authorized entry with an unavailable
  project or incompatible definition, without a query payload. Revoked data
  access remains PermissionDenied; an unknown/deleted/private-foreign entry is
  NotFound. No failed open changes the current URL or silently drops settings.
- Recovery retains the current usable screen/settings, explains the unavailable
  saved view, permits Rename/Delete when authorized, and lets the person save
  their current valid view under a new name. Unsupported status/label filters
  are not invented; only actual supported references can become obsolete.

### Lifetime and publication

- Catalog arrival never applies a view. Only explicit Open performs a fresh Get
  and one intentional URL navigation. Capture account, organization and current
  URL/intent; a late response after a scope, screen or editing change cannot
  replace newer intent. Clear transient selection/detail when applying.
- Personal query/name contents are not broadcast on the organization event
  bus. Catalog reads are fresh when opened, Get is fresh on explicit use, and
  local successful writes invalidate the catalog. No new business event or
  notification is required for bookmark configuration; this deliberately
  avoids making private configuration an organization-wide event payload.
- Add both-dialect migrations and generated TS/Go clients. Keep existing rows,
  wire fields and old-client decodes intact. Roll back GUI/tool exposure first;
  retain additive storage. Staged RPC-to-GUI coverage exceptions name T03 and
  are removed when the actual controls consume the service.

## Consequences

Names persist across devices with a clear audience and no ownership override.
Shared configuration requires the same live administrative authority as other
organization administration. Opening always earns current data access again.
Private and shared metadata remain distinct from authorized query contents.

Save-as-new and immutable audiences deliberately avoid hidden overwrites and
privacy-changing edits. An obsolete entry needs an explicit recovery action;
it is never silently rewritten against the current project. A person without
current organization access cannot use ownership alone to reopen old tenant
configuration. Organization deletion still removes its entire configuration.
