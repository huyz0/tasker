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
