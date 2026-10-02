# M34 — Progress Journal

## M34-T01 — M10 made true

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `apps/backend/src/modules/orgs/orgs.handler.ts` (+ test),
  `modules/roles/roles.test.ts`, `lib/policy.test.ts`,
  `apps/gui/src/features/Roles/index.test.tsx`,
  `.milestones/MILESTONE-10-teams-and-policy-rbac/MILESTONE.md`
- **Verified**: `bun test` 1885 pass; `bunx vitest run src/features/Roles` 20
  pass. The owner-grant test failed first.
- **Notes**: M10 was `done` with 0/8 exit criteria checked. Checking each
  against the repository, rather than ticking them: five had evidence; two
  had none — "100 roles is a tested configuration" and the 100-role matrix —
  and now have tests (the matrix's is that rows are virtualized, so a
  104-role org mounts only a viewport's worth); one was **false**:
  `updateOrgMemberRole` authorized ownership changes by comparing the caller's
  tier to `"owner"`, so `org:owner` held through a grant did not count. It
  now asks `can(…, "org:owner")`. Criterion 5 also lacked its one named
  combination (a team granted at project scope), now in `policy.test.ts`.
  Each box in M10 names its evidence.
- **Next**: M34-T02
