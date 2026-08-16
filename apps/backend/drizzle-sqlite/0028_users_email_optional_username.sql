-- M13-T02. `users.email` stops being required, and `users.username` is
-- added as the new stable local handle. SQLite has no `ALTER COLUMN` for
-- constraint changes (dropping NOT NULL), so this is the standard
-- create-copy-drop-rename rebuild, restricted to the `users` table only.
--
-- Hand-written rather than `drizzle-kit generate`: this repo's SQLite
-- migration snapshots (`drizzle-sqlite/meta/*_snapshot.json`) have not been
-- regenerated since 0023 — migrations 0024-0027 were all hand-authored
-- "custom" migrations that changed `schema.sqlite.ts` without a matching
-- snapshot update. Running `generate` against the current schema therefore
-- re-proposes `task_statuses.position` (already added in 0024) and the
-- `remote_pull_requests_task_id_idx` index (already added in 0027) as new
-- changes, which would fail on any already-migrated database with
-- "duplicate column"/"index already exists". Pre-existing drift, not
-- introduced here — worth a snapshot resync as its own task (flagged in
-- M13-T02's PROGRESS.md entry), out of scope for this one.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`username` text,
	`name` text,
	`avatar_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "username", "name", "avatar_url", "created_at")
SELECT "id", "email", NULL, "name", "avatar_url", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
