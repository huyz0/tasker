---
id: M03
title: IAM Correctness & Scale
status: in-progress
goal: User, role and organization management is correct, safe to operate, and usable at 100 organizations and 100,000 members per organization.
depends_on: [M01]
surfaces: [backend, gui, cli, contract]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
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

- [ ] `listOrgMembers` returns a bounded page with a cursor, a total count, and
      server-side name/email search, and answers in under 200 ms against an org
      seeded with 100,000 members.
- [ ] The members screen renders that org without the browser exceeding 16 ms
      frame budget on scroll, and a named member can be found in one search.
- [ ] A user holding `viewer` receives `PermissionDenied` on every mutating RPC,
      proven by an exhaustive per-endpoint test.
- [ ] A member can leave an organization; the last owner still cannot.
- [ ] Pending invitations can be listed and revoked, and expire automatically.
- [ ] Removing a member who owns projects requires reassignment and cannot leave
      a dangling owner.
- [ ] `purgeOrg` either completes fully or leaves no trace of partial deletion.
- [ ] A sub-organization is never omitted from the tree because of pagination.

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

- [ ] **M03-T04** — Require reassignment of owned projects when removing a member,
      returning `FailedPrecondition` with the blocking project ids.
      - Files: `modules/orgs/orgs.handler.ts`, `features/Organizations/index.tsx`
      - Verify: removing a project owner is blocked until reassigned.

- [ ] **M03-T05** — Scope agent roles to an organization: add `orgId`, migrate
      existing rows, and gate writes on org admin rather than admin-of-any.
      - Files: `db/schema.*.ts`, migrations, `modules/agents/agents.handler.ts`,
        `lib/authz.ts`
      - Verify: an admin of org A cannot edit org B's agent role.

### Scale

- [ ] **M03-T06** — Rewrite `listOrgMembers` on `executePaginatedQuery` with a join
      to `users`, eliminating the `IN` clause; support filter and sort.
      - Files: `modules/orgs/orgs.handler.ts`, `db/query-builder.ts`
      - Verify: 100,000-member org returns page 1 in under 200 ms.

- [ ] **M03-T07** — Honour the `page` field the contract already declares, and
      return `nextCursor` and `totalCount`.
      - Files: `modules/orgs/orgs.handler.ts`, `packages/shared-contract/main.tsp`
      - Verify: paging through 100,000 members visits each exactly once.

- [ ] **M03-T08** — Virtualize the members table and add a search input bound to
      the server-side filter, plus a role facet.
      - Files: `apps/gui/src/features/Organizations/index.tsx`
      - Verify: scrolling 100,000 rows stays at 60 fps.

- [ ] **M03-T09** — Return organizations as a tree, or resolve ancestors for every
      loaded child, so a sub-organization is never dropped at a page boundary.
      - Files: `modules/orgs/orgs.handler.ts`, `features/Organizations/index.tsx`
      - Verify: with `limit=1`, every org still renders at its correct depth.

- [ ] **M03-T10** — Page the agent-role picker rather than reading only the first
      response.
      - Files: `apps/gui/src/features/Agents/index.tsx`
      - Verify: the 120th agent role is selectable.

### Invitations

- [ ] **M03-T11** — Add `expiresAt` to invitations with a default window, and
      ignore expired invitations at login.
      - Files: `db/schema.*.ts`, migrations, `modules/auth/auth.ts`
      - Verify: an expired invitation does not join the user.

- [ ] **M03-T12** — Add `listInvitations` and `revokeInvitation` RPCs, admin-gated,
      plus CLI commands.
      - Files: `packages/shared-contract/main.tsp`, `modules/orgs/orgs.handler.ts`,
        `apps/cli/cmd/orgs.go`
      - Verify: an invitation can be listed then revoked and no longer applies.

- [ ] **M03-T13** — Build the invite UI in the Organizations view: an invite form,
      a pending list with role and expiry, and a revoke action.
      - Files: `apps/gui/src/features/Organizations/index.tsx`
      - Verify: an administrator invites and revokes without touching the CLI.

### Discovered during delivery

- [ ] **M03-T15** — Make `createTask`'s task-number claim atomic on SQLite.
      `db.transaction(async …)` is a no-op on `bun:sqlite`: drizzle hands the
      callback to `client.transaction(fn)`, which commits as soon as `fn`
      returns, so an async callback commits before its first statement runs.
      Proven in M03-T03: eight concurrent `createTask` calls all returned
      `ENG-1`. Audit every `db.transaction` call site for the same shape.
      - Files: `modules/tasks/tasks.handler.ts`, any other `db.transaction` site
      - Verify: concurrent `createTask` calls produce distinct display ids.

### Proof

- [ ] **M03-T14** — Extend the seed script with a `--members N` mode and record
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
