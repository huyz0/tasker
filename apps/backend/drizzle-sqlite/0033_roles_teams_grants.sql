-- M10-T02 (ADR-0013). Six new, purely additive tables - no existing table
-- changes, so (unlike 0028/0030/0032) this needs no table-rebuild dance and
-- carries no risk of re-proposing already-applied drift from the stale
-- snapshot history noted in 0028's header comment. Still hand-written
-- rather than `drizzle-kit generate`, for the same reason: generate would
-- still walk the whole schema against the stale 0023 snapshot and re-emit
-- 0024-0032's changes alongside this one.
CREATE TABLE `permissions` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`name` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `roles_org_id_idx` ON `roles` (`org_id`);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_key` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_key`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `teams_org_id_idx` ON `teams` (`org_id`);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `user_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_members_user_id_idx` ON `team_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `grants` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `grants_subject_idx` ON `grants` (`subject_type`,`subject_id`);
--> statement-breakpoint
CREATE INDEX `grants_scope_idx` ON `grants` (`scope_type`,`scope_id`);
