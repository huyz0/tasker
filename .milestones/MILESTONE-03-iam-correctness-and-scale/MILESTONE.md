---
id: M03
title: IAM Correctness & Scale
status: done
goal: User, role and organization management is correct, safe to operate, and usable at 100 organizations and 100,000 members per organization.
depends_on: [M01]
surfaces: [backend, gui, cli, contract]
exit_criteria_met: true
started_at: 2026-08-15
completed_at: 2026-08-15
---

# M03 — IAM Correctness & Scale

## 1. Goal

An administrator can operate an organization of 100,000 members: find a person,
change their role, remove them safely, and see who is pending invitation. A
viewer genuinely cannot write. A member can leave. No membership operation
loads an unbounded result set, and no screen renders an unbounded list.

## 2. Why Now

Two defects here are correctness failures rather than gaps: `listOrgMembers`
throws above roughly 32,000 members because it builds one SQL placeholder per
member, and the `viewer` role grants full write access while the UI states in
plain text that it is read-only. Both are cheap to fix and both are load-bearing
for M04 and M10, which extend the same authorization surface.

## 3. Exit Criteria

- [x] `listOrgMembers` returns a bounded page with a cursor, a total count, and
      server-side name/email search, and answers in under 200 ms against an org
      seeded with 100,000 members.
      *Measured — `bun run measure:members` at 100,001: page1 72.7 ms, sorted
      47.0 ms, filtered 72.3 ms, role facet 82.4 ms, deep cursor 32.4 ms.*
- [x] The members screen renders that org without the browser exceeding 16 ms
      frame budget on scroll, and a named member can be found in one search.
      *Measured (M03-T16) — 17 rows in the DOM for 100,002 members, 0.0% dropped
      frames over 239 sampled, p95 19.3 ms, worst frame 23.5 ms, against an
      empty-page control that also drops 0.0%. Search for "Member 0050000"
      returns "Showing 1 of 1". See the note below on the literal 16 ms figure.*
- [x] A user holding `viewer` receives `PermissionDenied` on every mutating RPC,
      proven by an exhaustive per-endpoint test.
      *`src/lib/viewer-denial.test.ts` — 64 tests, deny-by-default with an
      explicit read allowlist and a completeness test that fails naming any
      unclassified method, so a new unguarded RPC breaks the build.*
- [x] A member can leave an organization; the last owner still cannot.
      *`orgs.test.ts` — a member, and a viewer, can leave; the sole owner cannot;
      an owner can once a second exists; leaving publishes the same
      `member_removed` event as an admin removal.*
- [x] Pending invitations can be listed and revoked, and expire automatically.
      *`listInvitations` / `revokeInvitation`, 14-day TTL, `expired` computed
      server-side; admin-gated, and an admin of another org cannot revoke this
      one's. Managed from the GUI (M03-T13).*
- [x] Removing a member who owns projects requires reassignment and cannot leave
      a dangling owner.
      *`FailedPrecondition` naming the blocking project ids, on both the admin
      removal path and the self-leave path; archived projects still count.*
- [x] `purgeOrg` either completes fully or leaves no trace of partial deletion.
      *A purge failing partway leaves the organization exactly as it was and
      publishes no `purged` event — the transaction is now real on SQLite, which
      it was not before M03-T03.*
- [x] A sub-organization is never omitted from the tree because of pagination.
      *With `limit=1`, every organization still resolves to its correct depth;
      missing parents come back as `ancestors`, intersected with the caller's
      memberships so a parent they cannot see is not disclosed.*

**On criterion 2's "16 ms frame budget".** A `requestAnimationFrame` delta of
~16.7 ms *is* 60 fps — it is the vsync cadence, not a violation — so read
literally this criterion is unsatisfiable by any page, including the blank
control that measures p50 16.70 ms. It is recorded as met in substance: the
threshold that means anything is a frame spanning two vsyncs (~25 ms), and the
worst frame of 239 never reaches one. The measurement is a script run against
the dev stack, not a CI gate; jsdom has no compositor, so this cannot be a unit
test. Flagged for **M12**.

## 4. Scope

**In Scope**: `OrgService`, `lib/authz.ts`, the invitations model, the
Organizations view, agent-role tenancy, and the CLI commands that mirror them.

**Out of Scope**: custom roles and permission policy (M10), teams (M10), agent
credentials (M04), audit log persistence (M08), email delivery infrastructure
(M11 — this milestone records the invitation, M11 sends it).

## 5. Task Breakdown

### Correctness

- [x] **M03-T01** — Enforce `viewer` as read-only: add `assertOrgWriter`, apply it
      to every mutating handler, and cover each endpoint with a denial test.
      - Files: `apps/backend/src/lib/authz.ts`, all `modules/*/*.handler.ts`
      - Verify: a viewer receives `PermissionDenied` from every write RPC.

- [x] **M03-T02** — Allow a member to leave an organization, keeping only the
      last-owner guard; expose `cli orgs leave`.
      - Files: `modules/orgs/orgs.handler.ts`, `apps/cli/cmd/orgs.go`
      - Verify: a member removes themselves; a sole owner cannot.

- [x] **M03-T03** — Wrap `purgeOrg` in a single transaction.
      - Files: `modules/orgs/orgs.handler.ts`
      - Verify: a forced mid-purge failure leaves the org intact.

- [x] **M03-T04** — Require reassignment of owned projects when removing a member,
      returning `FailedPrecondition` with the blocking project ids.
      - Files: `modules/orgs/orgs.handler.ts`, `features/Organizations/index.tsx`
      - Verify: removing a project owner is blocked until reassigned.

- [x] **M03-T05** — Scope agent roles to an organization: add `orgId`, migrate
      existing rows, and gate writes on org admin rather than admin-of-any.
      - Files: `db/schema.*.ts`, migrations, `modules/agents/agents.handler.ts`,
        `lib/authz.ts`
      - Verify: an admin of org A cannot edit org B's agent role.

### Scale

- [x] **M03-T06** — Rewrite `listOrgMembers` on `executePaginatedQuery` with a join
      to `users`, eliminating the `IN` clause; support filter and sort.
      - Files: `modules/orgs/orgs.handler.ts`, `db/query-builder.ts`
      - Verify: 100,000-member org returns page 1 in under 200 ms.

- [x] **M03-T07** — Honour the `page` field the contract already declares, and
      return `nextCursor` and `totalCount`.
      - Files: `modules/orgs/orgs.handler.ts`, `packages/shared-contract/main.tsp`
      - Verify: paging through 100,000 members visits each exactly once.

- [x] **M03-T08** — Virtualize the members table and add a search input bound to
      the server-side filter, plus a role facet.
      - Files: `apps/gui/src/features/Organizations/index.tsx`
      - Verify: scrolling 100,000 rows stays at 60 fps.

- [x] **M03-T09** — Return organizations as a tree, or resolve ancestors for every
      loaded child, so a sub-organization is never dropped at a page boundary.
      - Files: `modules/orgs/orgs.handler.ts`, `features/Organizations/index.tsx`
      - Verify: with `limit=1`, every org still renders at its correct depth.

- [x] **M03-T10** — Page the agent-role picker rather than reading only the first
      response.
      - Files: `apps/gui/src/features/Agents/index.tsx`
      - Verify: the 120th agent role is selectable.

### Invitations

- [x] **M03-T11** — Add `expiresAt` to invitations with a default window, and
      ignore expired invitations at login.
      - Files: `db/schema.*.ts`, migrations, `modules/auth/auth.ts`
      - Verify: an expired invitation does not join the user.

- [x] **M03-T12** — Add `listInvitations` and `revokeInvitation` RPCs, admin-gated,
      plus CLI commands.
      - Files: `packages/shared-contract/main.tsp`, `modules/orgs/orgs.handler.ts`,
        `apps/cli/cmd/orgs.go`
      - Verify: an invitation can be listed then revoked and no longer applies.

- [x] **M03-T13** — Build the invite UI in the Organizations view: an invite form,
      a pending list with role and expiry, and a revoke action.
      - Files: `apps/gui/src/features/Organizations/index.tsx`
      - Verify: an administrator invites and revokes without touching the CLI.

### Discovered during delivery

- [x] **M03-T15** — Make `createTask`'s task-number claim atomic on SQLite.
      `db.transaction(async …)` is a no-op on `bun:sqlite`: drizzle hands the
      callback to `client.transaction(fn)`, which commits as soon as `fn`
      returns, so an async callback commits before its first statement runs.
      Proven in M03-T03: eight concurrent `createTask` calls all returned
      `ENG-1`. Audit every `db.transaction` call site for the same shape.
      - Files: `modules/tasks/tasks.handler.ts`, any other `db.transaction` site
      - Verify: concurrent `createTask` calls produce distinct display ids.

- [x] **M03-T16** — Hold 60 fps while scrolling the members table. Measured at
      100,001 members, the list dropped **14.6% of frames** (p95 35.4 ms ≈ 28 fps)
      while an empty-page control in the same browser dropped **0%** — so the cost
      was the component, not the environment. Two causes: per-row
      `measureElement` forcing a layout read per row per frame for rows that are
      a fixed height, and every visible row re-rendering on every scroll frame.
      Now **0.0% dropped**, p95 19.3 ms, against the same 0.0% control.
      - Files: `apps/gui/src/features/Organizations/index.tsx`
      - Verify: dropped frames under 2% against the same 100k fixture, with the
        empty-page control reported alongside.

### Proof

- [x] **M03-T14** — Extend the seed script with a `--members N` mode and record
      measured timings for 1k / 10k / 100k in this milestone's `PROGRESS.md`.
      - Files: `apps/backend/scripts/seed.ts`
      - Verify: the numbers are committed alongside the change.

## 6. Verification

```bash
cd apps/backend && bun run seed -- --members 100000
moon run backend:test
moon run gui:test
moon run gui:e2e
```

## 7. Risks

Adding `orgId` to `agentRoles` is a breaking data migration on a table that is
currently global; write the backfill to attach existing roles to the org of the
agents that reference them, and fail the migration loudly if a role is shared
across orgs rather than guessing.
