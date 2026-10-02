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

## M34-T02 — Frontmatter and ledger agree with the boxes

- **Status**: done
- **Date**: 2026-10-02
- **Changed**: `.milestones/MILESTONE-08-*/MILESTONE.md` (`todo` → `done`,
  criteria met, started 2026-08-20 / completed 2026-08-21 from its journal and
  STATE's close entry), `MILESTONE-{21,22,23}-*/MILESTONE.md` (`complete` →
  `done`), `.milestones/STATE.md` (M12 row 10 → 11; total line)
- **Verified**: a script over all 28 files: every `done` has all exit
  criteria and tasks checked or dropped; the ledger table sums to 273 tasks,
  269 done, 1 dropped.
- **Notes**: M12's "single deferred task" was never a task. Binary signing
  was scoped out of M09 and M12 as a note, and all eleven boxes are checked,
  so the ledger's 10 undercounted. Writing the total line by hand also
  produced an off-by-one in this session (270 written for 269) — the reason
  T03's gate checks the total line too, not only the rows.
- **Next**: M34-T03
