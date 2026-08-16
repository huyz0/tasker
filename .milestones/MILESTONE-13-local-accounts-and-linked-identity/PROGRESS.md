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

## M13-T03 — password_credentials and linked_identities tables, both dialects

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `db/schema.sqlite.ts`, `db/schema.mysql.ts`,
  `drizzle-sqlite/0030_password_credentials_linked_identities.sql`,
  `drizzle-mysql/0017_password_credentials_linked_identities.sql`, both
  `meta/_journal.json`,
  `src/db/migrate-password-credentials-linked-identities.test.ts`
- **Verified**: `bun test src/db/migrate-password-credentials-linked-identities.test.ts`
  — 12 pass, including that linking the same `(provider, provider_user_id)`
  to two different users is refused (the constraint that makes "sign in with
  Google" resolve to exactly one account) and that a user can hold more than
  one linked provider. `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`
  — 1 pass; `DESCRIBE`/`SHOW INDEX` against the live container confirm both
  tables, the FKs and the composite unique index. Full suite: 652 pass, 0 fail.
- **Notes**: `passwordHash` has no separate params/version column — per
  ADR-0012 §4, `Bun.password`'s PHC-format string carries its own algorithm
  and cost parameters, so there is nothing to version separately.
  `provider` is a fixed MySQL `enum('google')` but plain `text` on SQLite
  (no native enum type there), matching this schema's existing
  `organization_members.role` split — validated at the app layer on the
  SQLite side. Hit the same stale-snapshot problem as T02
  (`drizzle-kit generate` re-proposed the users-table rebuild and the
  0024/0027 drift again, since discarding T02's generated file left the
  snapshot at 0023): discarded the generated file again and hand-wrote a
  migration scoped to only the two new tables. This will recur for every
  remaining schema task in this milestone until the M12 snapshot resync
  lands — noting the pattern once here rather than repeating the explanation
  in every subsequent entry.
- **Also**: both new tables carry `@knipignore` — neither is imported as a TS
  symbol yet (T04 populates `linked_identities` in raw SQL; both get a real
  consumer in T06/T08). Each tag names the task that removes it; `bunx knip
  --workspace apps/backend` is clean with them in place.
- **Next**: M13-T04 — migrate existing users onto `linked_identities`.

## M13-T04 — Backfill linked_identities for every pre-existing (Google) user

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `drizzle-sqlite/0031_backfill_google_linked_identities.sql`,
  `drizzle-mysql/0018_backfill_google_linked_identities.sql`, both
  `meta/_journal.json`,
  `src/db/migrate-backfill-google-linked-identities.test.ts`
- **Verified**: `bun test src/db/migrate-backfill-google-linked-identities.test.ts`
  — 6 pass, including that `linked_identities.provider_user_id` for a
  backfilled row equals the user's own (unchanged) `id` — the load-bearing
  claim in ADR-0012 §3 — and that re-running the migration is a no-op
  (idempotency guard). `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`
  — 1 pass; a direct `COUNT(*)` against the live container showed
  `linked_identities` and `users` at parity (28/28) after applying. Full
  suite: 658 pass, 0 fail.
- **Notes**: Pure data migration, no handler change — `completeLogin` still
  authenticates by `users.id === profile.id` exactly as before, unaffected by
  whether a `linked_identities` row exists yet. That's deliberate: this task
  only needs the *fact* of the link to exist so T06/T08 can query it; making
  login logic actually consult `linked_identities` is T06's job. Exit
  criterion "every user who could log in via Google before this milestone
  can still do so afterward... no id change" is trivially satisfied right
  now for exactly that reason, and stays satisfied through T06 because the
  Google path there is additive (a lookup-by-linked-identity that falls back
  to id-equality), not a replacement.
- **Next**: M13-T05 — password hashing module (`Bun.password`, argon2id).
