# M03 — IAM Correctness & Scale · Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt. An entry is
opened `in-progress` before the work starts and closed in the commit that
completes the task.

---

## M03-T01 — Enforce viewer as read-only

- **Status**: done
- **Date**: 2026-08-15
- **Approach**: Add `assertOrgWriter` to `lib/authz.ts` and call it explicitly
  from every mutating handler, then prove the result with one contract-driven
  sweep test that denies by default — anything not on an explicit read allowlist
  must reject a viewer.
- **Weight**: heavy. It touches authorization and tenancy, so
  [ADR-0006](../../.specs/adr/ADR-0006-explicit-writer-assertion-over-a-mutation-interceptor.md)
  preceded the code and
  [a four-lens review](reviews/M03-T01-viewer-read-only-v1.md) preceded the box.
- **Changed**: `lib/authz.ts` (+`assertOrgWriter`, `WRITER_ROLES`), 31 methods
  across 9 handler files, and `lib/viewer-denial.test.ts` (new, 62 tests).
- **Verified**: `moon check --all` — 23 tasks, 395 backend tests pass.
  The sweep went **31 fail → 0** across the change, and the 31 failing names
  matched the 31 converted methods exactly.
- **Notes**: the gap was larger than "viewer can write a bit". Of 84 handler
  methods, 60 mutate, and **31 of them accepted a viewer** — including
  `createProject`, `createTask`, `updateTask`, `createComment`, `createLabel`,
  every artifact write, and `syncPullRequests`. `createProject` threw nothing at
  all: a viewer simply got a project. The rest were already admin-gated.

  Three things were proved rather than assumed:

  1. **The gate catches a future endpoint.** A `recolourEverything` method was
     added to the labels handler with no guard; the completeness case failed
     naming `labels.recolourEverything`, and green returned on removal. Adding
     RPC 85 without a guard breaks the build.
  2. **The suite is not vacuous.** Review found that all 59 denial cases would
     pass if `assertOrgWriter` denied *everyone*. A positive control — a
     `member` can still create a label, a comment and a folder — now
     distinguishes "viewer cannot write" from "nobody can write".
  3. **Fixture ids must resolve.** Handlers resolve the org through
     `getTaskOrgId` and friends before checking permission, so a bogus id
     returns NotFound and the test passes while proving nothing. The assertion
     rejects NotFound explicitly and says so in its failure message.
- **Divergence**: 11 of the initial failures were wrong request shapes in the
  test, not missing guards — Zod parses before the authorization check, so those
  calls never reached it. Corrected against the real schemas
  (`binRetentionDays` not `retentionDays`, `taskNoteId` not `noteId`, `apiToken`
  not `accessToken`, `id` not `templateId`/`taskTypeId`, and `syncPullRequests`
  takes a `projectId`). That validation-before-authorization ordering is
  recorded as a low finding in the review rather than changed across 31
  handlers inside this task.
- **Next**: M03-T02

---

## M03-T02 — Let a member leave an organization

- **Status**: done
- **Date**: 2026-08-15
- **Approach**: Split `removeOrgMember`'s authorization by target — removing
  *someone else* still requires admin, removing *yourself* requires only
  membership — and delete the blanket "cannot remove yourself" rejection. The
  last-owner guard applies to both paths. Expose it as `cli orgs leave`,
  resolving the caller through `getIdentity` so no contract change is needed.
- **Weight**: heavy. It changes an authorization rule, so
  [a review](reviews/M03-T02-member-can-leave-v1.md) precedes the box. **No
  ADR**: the one alternative, a separate `leaveOrg` RPC, is a contract addition
  performing identical checks and an identical delete. A decision with no
  consequence is a description, so it is recorded in the review instead.
- **Changed**: `modules/orgs/orgs.handler.ts`, `apps/cli/cmd/orgs.go`
  (+`orgs leave`), `orgs.test.ts` (+7 cases), `orgs_test.go` (+2 cases),
  and one stale string in the GUI test.
- **Verified**: `moon check --all` — 23 tasks green. The seven new backend
  cases went 5 fail → 0 across the change. Verify line satisfied both ways: a
  member removes themselves (membership row gone), and a sole owner cannot
  (`FailedPrecondition`, row intact).
- **Notes**: a stranger passing their own id was the case worth catching. The
  obvious implementation — skip the admin check when `userId === caller` —
  would let a non-member reach a delete that matches nothing and returns
  `success: true`, reporting that they left an organization they were never in.
  `assertOrgMember` on the self path closes it, and there is a test.

  `cli orgs leave` takes no user id. It resolves the caller through
  `GetIdentity`, because requiring someone to look up their own id before they
  can leave is its own small absurdity. That costs one extra round trip.

  Leaving publishes `domain.org.member_removed`, same as an admin removal —
  asserted, because M08's audit trail would otherwise record removals and be
  blind to departures.
- **Divergence**: none in scope. The review flags forward that **M03-T04 must
  apply its owned-project reassignment guard to the leave path as well**, not
  only to the admin-removal path, or T04 will close a hole this task opened.
- **Next**: M03-T03

---

## M03-T03 — Wrap purgeOrg in one transaction

- **Status**: done
- **Date**: 2026-08-15
- **Approach**: `purgeOrg` issues six-plus independent deletes with no
  transaction, so a failure partway leaves templates and labels gone while the
  org, its members and its invitations remain. Move the whole delete sequence
  into `db.transaction`, and prove it with a test that injects a failure at a
  chosen delete and asserts nothing was removed.
- **Weight**: judged not heavy at the outset. That judgement was wrong — see
  below — but the escalation it would have triggered (an ADR) would not have
  helped, because the finding was empirical, not a choice between options.
- **Changed**: `modules/orgs/orgs.handler.ts`, `orgs.test.ts` (+3 cases).
- **Verified**: `moon check --all` — 23 tasks green. The injected-failure case
  went red → green: before the change it observed `templates: 0, labels: 0`
  against an org that still had its members and its row; after, every count is
  unchanged. A successful purge still removes all five.
- **Notes**: **the obvious fix does nothing on SQLite, and that is the whole
  content of this task.** Wrapping the deletes in
  `await db.transaction(async (tx) => …)` left the test failing exactly as
  before. Reading drizzle's `bun-sqlite/session.js` explains it: the callback
  is handed to `client.transaction(fn)`, which is **synchronous** and commits
  as soon as `fn` returns. An `async` callback returns a promise immediately,
  so `COMMIT` lands before the first delete has run and the later throw rolls
  back nothing at all.

  The SQLite path is therefore written with drizzle's sync `.run()` / `.all()`
  and contains no `await` — not even `await 0`, which would defer past the
  commit. MySQL keeps the ordinary awaited form, where the transaction is
  genuinely async and holds one pooled connection. Two code paths, with the
  reason recorded inline, because a future reader will otherwise "tidy" them
  back into one and silently restore the bug.
- **Divergence — a pre-existing defect found and recorded, not fixed here**:
  `modules/tasks/tasks.handler.ts:381` uses the same broken shape to claim a
  project's `nextTaskNumber`. Its comment asserts the claim is atomic; it is
  not. Proven rather than inferred: eight concurrent `createTask` calls against
  one project all returned the display id **`ENG-1`**. Recorded as **M03-T15**
  with its reproduction, which also calls for auditing every `db.transaction`
  call site. Not folded into this task because it is a different handler with a
  different fix, and burying it in a purge commit would hide it.
- **Next**: M03-T04

---

## M03-T04 — Require reassignment of owned projects before removal

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: Before deleting a membership, look for projects in that org
  owned by the target. If any exist, refuse with `FailedPrecondition` carrying
  the blocking project ids so the caller can act on them rather than guess.
  Applies to **both** paths the T02 review named: an admin removing someone,
  and a member leaving. Surface the ids in the Organizations view.
- **Weight**: not heavy on the decision axis, but it closes a hole T02 opened,
  so [the review](reviews/M03-T04-owned-project-guard-v1.md) runs.
- **Changed**: `modules/orgs/orgs.handler.ts`, `orgs.test.ts` (+6 cases),
  `features/Organizations/index.test.tsx` (+1 case).
- **Verified**: `moon check --all` — 23 tasks green; backend 4 fail → 0 with two
  controls green throughout, GUI 386 tests pass.
- **Notes**: two choices where the obvious option is wrong.

  **Archived projects still block.** Filtering `deletedAt IS NULL` would let
  someone leave while owning a binned project, and restoring it later
  reintroduces the dangling owner through the back door. Tested.

  **The query scopes on `orgId` *and* `ownerId`.** Scoping on owner alone would
  block leaving org A because of work owned in org B.

  The stranded state was invisible precisely because it was *legal*: the
  project's `ownerId` foreign key stays satisfied when the membership goes —
  the user still exists, they are simply not a member — so nothing complained
  and the project just had an owner who could not be assigned work and did not
  appear in the member list.
- **Divergence**: the task lists `features/Organizations/index.tsx` as a file to
  change; **no component change was needed**. The view already renders the
  mutation error verbatim and the server message carries the ids. Parsing that
  message to re-render it as a list would couple the component to server
  wording for no gain. A GUI test asserts the ids reach the screen instead, so a
  change that swallows or truncates the message fails.
- **Next**: M03-T05

---

## M03-T05 — Scope agent roles to an organization

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: `agent_roles` is a global catalogue every tenant shares, so an
  admin of any organization can rewrite a persona another organization's agents
  run on. Add `orgId`, backfill from the agents that reference each role, and
  replace `assertOrgAdminOfAny` with `assertOrgAdmin` against the role's own
  org. Contract gains `orgId` on `AgentRole`, `CreateAgentRoleRequest` and
  `ListAgentRolesRequest` as new field numbers.
- **Weight**: heavy — a breaking data migration on a shared table, the
  milestone's own stated risk.
  [ADR-0007](../../.specs/adr/ADR-0007-agent-roles-belong-to-one-organization.md)
  first, [review](reviews/M03-T05-agent-role-tenancy-v1.md) after.
- **Changed**: `main.tsp` + `tasker/health/v1/health.proto` (three new field
  numbers), both schemas, two migrations
  (`0021_scope_agent_roles_to_org.sql`, `0008_…`), `agents.handler.ts`,
  `apps/cli/cmd/agents.go` (+`--org`), `features/Agents/index.tsx`,
  `scripts/seed.ts`, `packages/shared-contract/moon.yml`, and eight test files.
- **Verified**: `moon check --all` — 23 tasks green, 410 backend tests. The
  verify line is proven directly: an admin of org A calling `updateAgentRole`
  on org B's role is rejected, and the row is re-read to confirm the prompt was
  not written. Plus cross-org create, list isolation, borrowing another org's
  role for a new agent, and member-can-read-but-not-write.
- **Notes**: **the abort guard did not work as first written, and only the
  migration test found it.** `bun:sqlite` silently discards errors from any
  statement after the first in a single `run()` call — `CREATE TABLE g(… CHECK
  …); INSERT INTO g VALUES(0);` completes without throwing and leaves `g`
  empty. Drizzle runs one chunk per `run()`, so a guard sharing a chunk with
  anything before it is decorative: the migration would have picked an
  arbitrary owner for a shared role and reported success. Every statement now
  has its own breakpoint chunk, with the reason written into the file.

  A second defect in the same file: a comment quoting the literal breakpoint
  marker split the file there, because drizzle splits on that exact string
  wherever it appears. That left a comment-only chunk which fails as invalid
  SQL. Also caught by the test, not by reading.

  The migration is tested against a database built in the **pre**-migration
  shape. Running it through drizzle's migrator would only ever exercise the
  empty-database path, which is the one case that cannot go wrong.
- **Divergence — three things beyond the task's file list**:

  1. `packages/shared-contract/moon.yml`'s `compile` inputs listed `**/*.tsp`
     but not the `.proto` that `buf` actually generates from (`buf.yaml`
     excludes `tsp-output`). Editing the proto did not invalidate the cache, so
     `moon run compile` reported success and regenerated nothing. Fixed.
  2. The GUI roles query key was `['agentRoles']` with no org in it. With the
     request now org-scoped, switching organizations would have served the
     previous org's roles from cache — a cross-tenant leak in the client.
  3. A CLI negative test passed spuriously: cobra keeps flag values on the
     command object and the whole package shares one `rootCmd`, so an earlier
     test's `--org` was still set. It resets both flags explicitly now.
- **Correction to ADR-0007**: it claimed `assertOrgAdminOfAny` "goes away
  entirely". It does not — `telemetry.ts` still uses it for `/api/debug/*`,
  which is platform-wide rather than org-scoped. The ADR now says so.
- **Next**: M03-T06

---

## M03-T06 — Rewrite listOrgMembers on the paginated query

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: `listOrgMembers` loads every membership row, then fetches the
  users with `inArray(users.id, userIds)` — one SQL placeholder per member, so
  it throws outright past SQLite's variable limit and is unbounded before that.
  Replace it with one joined, cursor-paginated query. `executePaginatedQuery`
  cannot express that today (no join, and it assumes a single `id` column, which
  `organization_members` does not have), so the helper is generalised rather
  than bypassed — a second cursor implementation is how cursor formats drift.
- **Weight**: not heavy — no alternative worth an ADR.
  [Reviewed](reviews/M03-T06-list-org-members-v1.md) anyway because it changes a
  shared helper every list endpoint uses.
- **Changed**: `db/query-builder.ts` (`PaginatedQueryShape`, OR-filter across
  several columns, configurable id column / default sort),
  `modules/orgs/orgs.handler.ts`, `orgs.test.ts` (+4 cases).
- **Verified**: `moon check --all` — 23 tasks, 415 backend tests. The verify
  line is **measured against 100,001 members**:

  | Query | Median |
  |---|---|
  | page 1, default sort | 62.8 ms |
  | page 1, sorted by name | 76.3 ms |
  | filtered search | 117.0 ms |
  | deep page via cursor | 28.5 ms |

  All inside the 200 ms budget. The old implementation was run at the same size
  to confirm it **throws** rather than merely being slow:
  `SQLite query expected 34464 values, received 100000`. The plan estimated the
  ceiling at "roughly 32,000"; measured, it is **34,464** in this bun:sqlite
  build.
- **Notes**: the helper was generalised rather than bypassed. Writing a second,
  member-specific cursor implementation would have been quicker and is how
  cursor formats drift — two encoders that disagree produce cursors decoding to
  the wrong page, and nobody notices until a user reports skipped rows.
  `executePaginatedQuery` now takes an optional shape: a select map, one inner
  join, an id column for tables without `id`, and a default sort.

  The join is applied to the **count** as well as the page, because the filter
  references joined columns and counting without it reports a total the caller
  can never page to.

  One defect the tests caught: with no default sort the helper fell back to
  `table.createdAt`, which `organization_members` does not have — it records
  `joinedAt`. SQLite reported `no such column: desc`, naming neither the table
  nor the problem.

  The paging test asserts distinctness as well as count. Counting alone passes
  if a cursor skips one member and repeats another, which is the characteristic
  cursor bug.
- **Divergence**: the 100k measurement lives in the journal as numbers rather
  than in the suite as a test. Seeding 100,000 rows costs ~1.7 s and the
  assertion is a latency budget, which makes a flaky gate on a shared machine.
  The committed tests use hundreds of rows and assert behaviour. **M03-T14**
  owns making these numbers reproducible from the seed script.
- **Next**: M03-T07

---

## M03-T07 — Honour the contract's page field end to end

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: The contract has always declared `page` on both
  `ListOrgMembersRequest` and `ListOrgMembersResponse`; M03-T06 made the server
  honour it. What T06 also did was cap the response at 50 rows, and the
  Organizations view renders whatever it receives — so it now shows 50 of an
  organization's members with nothing to say more exist. Prove the server-side
  paging over 100,000 members, and close that truncation rather than carry a
  silent data-loss regression into T08.
- **Weight**: not heavy.
  [Reviewed](reviews/M03-T07-page-field-honoured-v1.md), because it fixes a
  regression this milestone introduced.
- **Changed**: `features/Organizations/index.tsx` + its test. **No contract
  change was needed** — `page` was already declared on both the request and the
  response, and T06 made the server honour it.
- **Verified**: the verify line, measured over the full set under three
  orderings:

  | Sort | Pages | Rows | Distinct | Dupes | Missing | totalCount |
  |---|---|---|---|---|---|---|
  | `name:asc` | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |
  | `role:desc` | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |
  | default (`joinedAt`) | 1001 | 100,001 | 100,001 | 0 | 0 | 100,001 |

  `moon check --all` — 23 tasks green, 387 GUI tests.
- **Notes**: the fixture gives members **deliberately repeating** names
  (`Member 0000`–`0999` across 100,000 rows) and only two distinct roles. That
  is the whole point of the test. With unique sort values a broken tiebreak
  still looks correct, because no page boundary ever falls inside a run of
  equal values; `role:desc` sorts 100,000 rows into two groups so nearly every
  boundary does.
- **Divergence — a regression from M03-T06, found and fixed here**: T06 capped
  the server response at 50 rows while the Organizations view read
  `resp.members` from a single call. The Roles & Permissions table was
  therefore showing the first 50 members of an organization with nothing on
  screen to say the rest existed. The component now pages until the cursor runs
  out, and the new test was confirmed to **fail against the unfixed component**
  rather than merely pass against the fixed one.

  That fix loads every member into memory, which at 100,000 members is 100,000
  rows in the browser. It matches the existing idiom in `features/Agents` and is
  the honest interim, not the destination — **M03-T08** replaces it with a
  virtualized, server-filtered table.
- **Next**: M03-T08

---

## M03-T08 — Virtualize the members table with server-side search

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: Replace T07's fetch-every-page interim with a windowed list.
  Search and the role facet bind to the server's `filter` (debounced), so the
  browser holds a page rather than an organization, and `@tanstack/react-virtual`
  renders only the visible rows. Infinite-scroll the cursor as the user reaches
  the end.
- **Weight**: heavy — it adds a screen behaviour a user has to learn, so it got
  a [UX pass](design/M03-T08-members-table.md) covering the
  empty/loading/error/permission states before the code, and
  [a review](reviews/M03-T08-virtualized-members-v1.md) after.
- **Changed**: `main.tsp` + `health.proto` (`ListOrgMembersRequest.role`, new
  field number), `orgs.handler.ts`, `features/Organizations/index.tsx`,
  `orgs.test.ts` (+4), the Organizations test (+6), and one correction to
  `ui-ux-standard.md`.
- **Verified**: `moon check --all` — 23 tasks, 393 GUI tests, 41 org tests.
- **Notes**: the verify line is a frame budget, which no jsdom test can measure.
  What is measured is the mechanism behind it: **9 DOM rows for 1000 members**.
  Without windowing that is 1000. The number was obtained by forcing the
  assertion to fail and reading the real count rather than assuming the window
  worked — in jsdom a virtualizer with no layout can just as easily render
  everything or nothing, and either would have made this test meaningless.

  The role facet needed a contract field rather than a client-side filter.
  Filtering the loaded window would report "3 admins" for an organization with
  200 of them, which reads as an answer instead of as a truncation.

  Both inputs are in the react-query key. A cursor minted against the
  unfiltered set means nothing against a filtered one, so changing search or
  facet must start a new list — keying on them makes that structural rather
  than something to remember.
- **Divergence**: `ui-ux-standard.md` §1 still instructed agents to "rely purely
  on standard UI primitive libraries (**Shadcn UI**)". Shadcn is not installed
  and ADR-0005 records why. Corrected while loading the standard for this task —
  M02's sweep read the tech-stack tables and standards prose separately, and
  this one slipped through both.
- **Deferred to M06 with reasoning**: a viewer sees the role `<select>` and
  Remove and can click them; the server refuses and the error line shows why.
  Disabling them client-side by role would be a second copy of the
  authorization rules drifting from `lib/authz.ts`. Written into the design note
  so the next person does not "fix" it by duplicating policy into the client.
- **Next**: M03-T09

---

## M03-T09 — Never drop a sub-organization at a page boundary

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: `listOrgs` pages a flat list and the GUI nests by `parentOrgId`.
  A child whose parent is on a later page therefore has no parent to hang off,
  so it either disappears or renders at the wrong depth. Resolve every loaded
  child's ancestors server-side and return them alongside the page.
- **Weight**: not heavy on the decision axis;
  [reviewed](reviews/M03-T09-org-tree-ancestors-v1.md) because it changes what a
  paginated endpoint returns.
- **Changed**: `main.tsp` + `health.proto` (`ListOrgsResponse.ancestors`, new
  field number), `orgs.handler.ts`, `features/Organizations/index.tsx`,
  `orgs.test.ts` (+3), the Organizations test (+2).
- **Verified**: `moon check --all` — 23 tasks, 395 GUI tests, 44 org tests. The
  verify line is tested as stated: page with `limit=1`, and for every
  organization on every page walk its ancestor chain using **only what that page
  made visible**. Proven capable of failing — with ancestor resolution stubbed
  out it fails naming the dropped org.
- **Notes**: the defect was invisible rather than wrong-looking. A child whose
  parent was on another page arrived with a `parentOrgId` matching nothing
  loaded, so the nesting loop filed it under a key nothing iterates: present in
  the data, never drawn, nothing logged. It did not render at the wrong depth —
  it was simply absent.

  The task offered "return a tree **or** resolve ancestors". Ancestors, because
  a tree and a cursor do not compose: a page is a slice of an ordering, and a
  tree is not sliceable without either sending whole subtrees — unbounded,
  which is the defect this milestone exists to remove — or inventing a second
  traversal order.

  **Ancestor resolution is restricted to organizations the caller is already a
  member of.** Fetching parents unconditionally looks equivalent, because the
  pagination defect only involves organizations the caller can already see. It
  is not: a person can be a member of a sub-organization without being a member
  of its parent, so the unrestricted version hands them the name of an
  organization they were never added to. There is a test for exactly that shape.
- **Next**: M03-T10

---

## M03-T10 — Page the agent-role picker

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: The roles query reads `resp.roles` from one call, so past the
  server's page size a role simply cannot be picked and its name renders as
  blank in the agents table. Page it the way the agents query beside it already
  does.
- **Weight**: not heavy. No separate review file: the change is four lines and
  the two tests are the record.
- **Changed**: `features/Agents/index.tsx`, its test (+2 cases).
- **Verified**: `moon check --all` — 23 tasks, 397 GUI tests. Both new tests
  were confirmed to **fail** against the unpaged query before the fix.
- **Notes**: the verify line names the 120th role, so the fixture pages at 100
  and the assertion asks for `Role 120` by its accessible option name. A second
  case covers the half of this defect the verify line does not mention: an
  *existing* agent holding a role from a later page rendered with a **blank**
  role name, because `roleNameById` had no entry for it. Blank reads as data
  loss rather than as a truncated list, and nothing in the UI said which it was.

  The fix uses the same `fetchAllPages` helper the agents query beside it
  already used — the two queries sat next to each other, one paged and one not.
- **Next**: M03-T11

---

## M03-T11 — Expire invitations

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: Invitations never expire, so an address invited once can be
  redeemed into the organization at any point afterwards — including long after
  the person who sent it left. Add `expiresAt` with a default window, set it on
  create, and skip expired rows at login.
- **Weight**: heavy — it touches authorization and adds a migration, so
  [the review](reviews/M03-T11-invitation-expiry-v1.md) runs.
- **Changed**: both schemas, two migrations (`0022_invitation_expiry.sql`,
  `0009_…`), `orgs.handler.ts` (+`INVITATION_TTL_DAYS`, 14 days),
  `modules/auth/auth.ts`, `auth.test.ts` (+4), `orgs.test.ts` (+3).
- **Verified**: `moon check --all` — 23 tasks, 43 org tests, 30 auth tests. The
  verify line is tested directly: an expired invitation leaves the user with
  **zero** memberships while the login itself still succeeds.
- **Notes**: three places where the obvious version is wrong.

  **`expires_at` is nullable and null means valid.** `NOT NULL` would have put
  an expiry on invitations issued before the concept existed, and backfilling
  to the epoch would have revoked every outstanding invitation the instant the
  migration ran — a support incident, not a migration. There is a test for the
  legacy row.

  **Re-inviting renews an expired invitation.** The duplicate check
  short-circuits on `(orgId, email)`, so without renewal a lapsed invitation is
  permanently un-reissuable and the admin's only remedy is deleting a row the
  UI does not show them. It renews the role too.

  **Re-inviting a live invitation does not extend it**, or the expiry is
  defeated by anyone re-sending and there is no window at all.

  Expired invitations are skipped at login rather than deleted: deleting them
  there makes the invitation vanish at the exact moment the person finally
  tries to use it, and hides from the admin that it lapsed unredeemed.
- **Divergence**: knip flagged `INVITATION_TTL_DAYS` as an unused export, which
  was correct and useful — the test had hardcoded 13/15 days beside a constant
  of 14. Importing the constant into the test fixed both: the export has a
  consumer and the assertion tracks the value.
- **Next**: M03-T12

---

## M03-T12 — List and revoke invitations

- **Status**: in-progress
- **Date**: 2026-08-15
- **Approach**: Invitations are write-only today — an admin can send one and
  then has no way to see it, let alone withdraw it. Add admin-gated
  `listInvitations` and `revokeInvitation` RPCs surfacing the expiry M03-T11
  added, plus the CLI commands that mirror them.
- **Weight**: heavy — new authorization surface, so
  [the review](reviews/M03-T12-invitation-list-revoke-v1.md) runs.
- **Changed**: both contract sources (3 messages, 2 RPCs), `orgs.handler.ts`,
  `apps/cli/cmd/orgs.go` (+`list-invites`, `revoke-invite`), `orgs.test.ts`
  (+6), `orgs_test.go` (+2), `viewer-denial.test.ts` (classification).
- **Verified**: `moon check --all` — 23 tasks, 49 org tests. The verify line end
  to end: list, revoke, list again (empty), and the row confirmed gone from the
  table, so a login for that address has nothing to redeem.
- **Notes**: **the M03-T01 sweep caught both new endpoints unprompted.** Adding
  the handlers made it fail by name — `orgs.listInvitations`,
  `orgs.revokeInvitation` — before a single test for them existed. That is the
  first time the gate has fired on genuinely new work rather than on a fault I
  injected to test it, which is the evidence ADR-0006's argument actually
  wanted. Both are classified under `REQUESTS`, not `READS`: `READS` means
  "a viewer may call this", not "this method does not write".

  `revokeInvitation` takes only an `invitationId` and authorizes against the
  row's own `orgId`. Accepting an `orgId` from the caller would let them name an
  organization they administer while pointing the id at an invitation in one
  they do not — tested with an admin of a second organization.

  `expired` is computed server-side. Three clients comparing dates in three
  timezones will eventually disagree about whether an invitation has lapsed,
  and lapsing is the single fact the list exists to show.
- **Next**: M03-T13
