-- M13-T09. `email` stops being required and `username` is added, so an
-- invitation can target a bare local handle instead of an address. Same
-- create-copy-drop-rename rebuild as 0028 (SQLite has no ALTER COLUMN for
-- dropping NOT NULL), restricted to `invitations` only. Hand-written for
-- the same stale-snapshot reason recorded in 0028's header comment.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text,
	`username` text,
	`invited_by` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_invitations`("id", "org_id", "email", "username", "invited_by", "role", "created_at", "expires_at")
SELECT "id", "org_id", "email", NULL, "invited_by", "role", "created_at", "expires_at" FROM `invitations`;--> statement-breakpoint
DROP TABLE `invitations`;--> statement-breakpoint
ALTER TABLE `__new_invitations` RENAME TO `invitations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `invitations_org_id_idx` ON `invitations` (`org_id`);
