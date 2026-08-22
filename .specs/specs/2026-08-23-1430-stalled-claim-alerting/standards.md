# Standards binding M25 — Proactive Alerting for Stalled Claims

Per `AGENTS.md` §3, standards are loaded per *task* (at most two), not per
milestone. `.agents/protocols/tdd.md` binds every task and does not count
toward the two.

| Task | Surface | Load |
|------|---------|------|
| T02 | backend DB/migrations | `api-standard`, `security-standard` (purge-cascade correctness) |
| T03 | backend `lib/` + handler rewire | `api-standard`, `observability-standard` (query-plan correctness at scale) |
| T04 | backend `lib/` + mail + scheduling | `api-standard`, `security-standard` (recipient resolution is an authorization-adjacent concern — who gets told about a task) |
| T05 | docs/verification/closeout | `testing-standard` (+ `milestone-standard` for the `.milestones/**` closeout edits) |

Points worth having in view for every M25 task, surfaced during design:

- No FK cascades exist anywhere in this codebase — every new child table
  needs explicit deletes in the relevant `cascadePurge.ts` functions, or a
  purge silently orphans rows (the exact discipline ADR-0020 established
  for `task_activity`).
- `lib/` modules dialect-branch via `STANDALONE === 'true' ? schemaSqlite :
  schemaMysql`; `modules/reports/` imports `schema.sqlite` unconditionally
  as a request-scoped shortcut that does NOT apply to a background job —
  the new detector belongs in `lib/`, using the `lib/` convention.
- A unique index treats NULL as distinct from NULL in both SQLite and
  MySQL — any new unique constraint on a nullable column needs an explicit
  check that it actually dedupes what it's meant to.
- `security-standard`: recipient resolution decides who receives
  information about a task's state — treat it with the same care as an
  authorization check, even though no RPC boundary is crossed.
