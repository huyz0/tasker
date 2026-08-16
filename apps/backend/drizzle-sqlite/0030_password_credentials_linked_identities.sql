-- Custom SQL migration file, put your code below! --

-- M13-T03. Hand-written for the same reason 0028/0029 were: the snapshot
-- history is stale since 0023 (see 0028's header comment), so
-- `drizzle-kit generate` re-proposes 0024's and 0027's changes alongside
-- this one. Isolated to just the two new tables.
CREATE TABLE `linked_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linked_identities_provider_identity_idx` ON `linked_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `linked_identities_user_id_idx` ON `linked_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `password_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`must_change_password` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
