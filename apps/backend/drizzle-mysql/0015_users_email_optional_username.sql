-- M13-T02. See the SQLite counterpart (0028_users_email_optional_username.sql)
-- for the full reasoning. MySQL supports MODIFY COLUMN directly, so this
-- dialect needs no table rebuild — `email` drops its NOT NULL, `username` is
-- added nullable (existing rows are backfilled by 0016; new rows always get
-- one via Zod at the app layer, the same "logically required, DB-nullable"
-- convention this schema already uses for `invitations.role` and
-- `task_statuses.position`'s SQLite counterpart).
ALTER TABLE `users` MODIFY COLUMN `email` varchar(256) NULL;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `username` varchar(256) NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);
