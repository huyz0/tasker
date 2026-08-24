CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`target_path` text,
	`dedupe_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_id_type_dedupe_key_idx` ON `notifications` (`user_id`,`type`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_created_at_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_read_at_idx` ON `notifications` (`user_id`,`read_at`);
