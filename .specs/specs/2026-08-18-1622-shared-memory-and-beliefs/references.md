# References for Shared Memory & Belief System

## Similar Implementations

### `apps/backend/src/modules/projects/` — module pattern to copy exactly

- **Location:** `apps/backend/src/modules/projects/projects.handler.ts`,
  `projects.test.ts`.
- **Relevance:** The most recently deep-reviewed module in this repo
  (M20) — its handler shape reflects every hard-won lesson (Zod schemas,
  proto3-optional field handling, `createdAt` conversion, soft-delete,
  unique-constraint races) that `memory.handler.ts` should start from
  rather than rediscover.
- **Key patterns to borrow:** `createXHandler(db, nc)` factory returning
  an object of async RPC methods; Zod schema per RPC defined just above
  the handler; `requireUser`/`requirePrincipal` → parse → `assertCan`/
  `authorizePrincipal` → business logic → `publishDomainEvent`, in that
  order; `insertRecord(db, table, payload, isStandalone, false)` with an
  explicit `createdAt: new Date()` in the payload (never rely on the
  DB-only auto-stamp); every `Date` field converted with
  `.toISOString()` before it reaches a proto `string` field (M20-T01's
  production-crash lesson); soft-delete via `softDeleteById`/
  `restoreById`/`notDeleted` from `db/query-builder.ts`; unique-name
  races closed with an app-level pre-check plus a DB-error-message
  fallback, verified against live MySQL.

### `apps/backend/src/modules/roles/roles.handler.ts` — RBAC RPC surface pattern

- **Location:** `apps/backend/src/modules/roles/roles.handler.ts`,
  `apps/backend/src/lib/policy.ts`, `apps/backend/src/lib/authz.ts`.
- **Relevance:** `grantRole`/`revokeGrant`/`listGrants` is the existing
  RPC surface for the exact `{scopeType, scopeId}` primitive ADR-0014
  reuses for belief scoping and ADR-0016's `promoteBelief` moves a
  belief between.
- **Key patterns to borrow:** `Scope = {type: 'organization'|'team'|
  'project', id: string}`; `can(db, principal, scope, permission):
  Promise<boolean>` / `assertCan(...)` as the single authorization entry
  point; `authorizePrincipal(db, principal, orgId, {scope, permission})`
  as the dual human/agent-token path — the exact function
  `memory.handler.ts`'s methods should call rather than re-deriving
  human-vs-agent branching.

### `apps/backend/src/modules/search/search.handler.ts` — retrieval infrastructure to extend, not rebuild

- **Location:** `apps/backend/src/modules/search/search.handler.ts`.
- **Relevance:** This is the concrete implementation `LexicalBelief
  Retriever` (ADR-0016) wraps — a real, production federated ranked
  search already solving FTS5/FULLTEXT dual-dialect indexing, cross-type
  merge, and cursor pagination for ranked results.
- **Key patterns to borrow:** The `SearchEntity` interface (`{type,
  rows(), count(), toResult()}`) — add `belief` as a sixth
  implementation rather than a parallel search path; `searchTokens`'s
  tokenization (strips everything but letters/digits, specifically to
  neutralize each dialect's operator syntax as an injection defense);
  round-robin allocation across entity types so no type crowds out
  another; snippet highlighting as server-computed offset ranges, never
  server-rendered HTML; `CROSS JOIN` join-order pinning and the
  `bun run measure:latency` re-measurement discipline (a schema change
  here previously took `universalSearch` from 58ms to 368s by inverting
  SQLite's join plan — re-measure after adding `beliefs_fts`).

### `apps/backend/src/lib/agentToken.ts` + `AGENT_RPC_SCOPES` — where the two new agent scopes plug in

- **Location:** `apps/backend/src/lib/agentToken.ts` (or wherever
  `AGENT_RPC_SCOPES` is defined — confirm exact path when M21-T03 lands).
- **Relevance:** ADR-0015's `memory:read`/`memory:write` scopes extend
  this exact table; the existing "unmapped RPC is denied to token
  principals" test that enumerates every RPC's required scope should
  fail the build until `MemoryService`'s methods are classified here,
  exactly as ADR-0008 designed it to.

### `apps/gui/src/components/layout/GlobalSearch.tsx` — search-first GUI interaction shape

- **Location:** `apps/gui/src/components/layout/GlobalSearch.tsx`.
- **Relevance:** The Memory screen's search-first landing view
  (M21-T07) should feel like this, not like a paginated table — same
  debounced-query, ranked-results, keyboard-navigable interaction shape,
  just embedded in a full screen instead of a ⌘K overlay.
- **Key patterns to borrow:** 300ms debounce before calling the search
  RPC; grouping/filtering results client-side without breaking flat
  keyboard-navigation index; rendering server-supplied highlight offset
  ranges via `<mark>`, never trusting server HTML.

### `apps/gui/src/components/ui/ConfirmDialog.tsx` (via `useConfirm`) — promotion confirmation pattern

- **Location:** `apps/gui/src/components/ui/ConfirmDialog.tsx`.
- **Relevance:** M20-T07 established the house pattern for every
  consequential GUI action (archive, unlink, revoke) — `promoteBelief`
  should use the identical `useConfirm()` + title/consequence/undo shape
  rather than inventing new confirmation UI.

### `.milestones/MILESTONE-08-events-audit-realtime/MILESTONE.md` — the only existing `MILESTONE.md` example at this repo's actual scale

- **Location:** `.milestones/MILESTONE-08-events-audit-realtime/`.
- **Relevance:** `.specs/specs/` had no prior spec-shape output to model
  against; this is the closest concrete example of the target level of
  detail (goal/why-now/exit-criteria/scope/task-breakdown/verification/
  risks) for a milestone of comparable size (11 tasks) to M21.
- **Key patterns to borrow:** Exit criteria phrased as externally
  verifiable product conditions, never activities; each task's `Files:`/
  `Verify:` pair kept to the primary paths and one concrete proof, not an
  exhaustive list.
