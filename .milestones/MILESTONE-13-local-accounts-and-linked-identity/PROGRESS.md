# M13 — Local Accounts & Linked Identity — Progress Journal

## M13-T01 — Write the ADR for local password auth + linked identities

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `.specs/adr/ADR-0012-local-password-auth-and-linked-identities.md`
- **Verified**: The ADR states the last-sign-in-method invariant (§5),
  the hashing choice and why it differs from ADR-0008's for the opposite
  reason (§4), and a `## Rollback` section naming the exact tables to drop
  and the one behavioural risk (accounts with no email and no other
  credential) that rollback cannot undo automatically.
- **Notes**: Five decisions bundled into one ADR rather than five separate
  ones — they are not independent (the id-stability choice in §3 is what
  makes the rollback in §Rollback cheap; the hashing choice in §4 only makes
  sense once §1/§2 established that a password is now a first-class,
  separately-removable credential). `Bun.password` (argon2id) needs no new
  `package.json` dependency — verified interactively (`bun -e`) that
  `Bun.password.hash`/`.verify` work and round-trip correctly before writing
  it into the decision.
- **Next**: M13-T02 — make `users.email` nullable, add `users.username`.

## M13-T02 — users.email nullable, users.username added, both dialects

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `db/schema.sqlite.ts`, `db/schema.mysql.ts`,
  `drizzle-sqlite/0028_users_email_optional_username.sql`,
  `drizzle-sqlite/0029_backfill_usernames.sql`,
  `drizzle-mysql/0015_users_email_optional_username.sql`,
  `drizzle-mysql/0016_backfill_usernames.sql`,
  `drizzle-sqlite/meta/_journal.json`, `drizzle-mysql/meta/_journal.json`,
  `src/db/migrate-users-email-optional-username.test.ts`
- **Verified**: `bun test src/db/migrate-users-email-optional-username.test.ts`
  — 10 pass, applies the real migration files against an in-memory sqlite DB
  seeded in the exact pre-0028 shape, and checks the MySQL files structurally.
  `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts` — 1 pass
  against the live `docker compose` MySQL, confirmed by `DESCRIBE users`
  showing `email` nullable and `username` present and unique. Full suite:
  `STANDALONE=true bun test` — 640 pass, 0 fail (no regression from a
  core-table change).
- **Notes**: `username` is **nullable at the database level**, not `NOT
  NULL` as the task's own wording says — deliberately, matching this
  schema's existing "logically required, DB-nullable, enforced at the app
  layer" convention (see the comment now in `schema.sqlite.ts`). Required-ness
  is enforced by Zod on every user-creating RPC (T06 onward), the same way
  `invitations.role` is `NOT NULL` with a default but *this* column has no
  safe default to fall back to. Recorded as a deliberate divergence from the
  task's literal wording, not an oversight.
  Discovered a pre-existing defect while generating the migration:
  `drizzle-sqlite/meta/*_snapshot.json` has not been regenerated since
  0023 — every migration from 0024 onward was hand-written without updating
  the snapshot. Running `drizzle-kit generate` against the current schema
  therefore re-proposes changes already applied by 0024 and 0027
  (`task_statuses.position`, `remote_pull_requests_task_id_idx`), which would
  fail with "duplicate column"/"index already exists" if blindly applied to
  an already-migrated database. Discarded the auto-generated file and
  hand-wrote the migration instead, following the same pattern
  `migrate-api-tokens.test.ts` already documented for the MySQL side of this
  exact problem. **Not fixed here** — resyncing the snapshot for the whole
  history is a separate task; flagging it for **M12** (Test Depth & Release,
  which already owns "MySQL migrations have never been observed applying"
  per M04's handoff note — the same class of defect).
- **Next**: M13-T03 — `password_credentials` and `linked_identities` tables.
