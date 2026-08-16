-- Custom SQL migration file, put your code below! --

-- M13-T09. See the SQLite counterpart (0032_invitations_username.sql) for
-- the full reasoning. MySQL supports MODIFY COLUMN directly.
ALTER TABLE `invitations` MODIFY COLUMN `email` varchar(256) NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `username` varchar(256) NULL;
