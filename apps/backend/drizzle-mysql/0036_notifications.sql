CREATE TABLE `notifications` (
	`id` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256),
	`type` varchar(128) NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`target_path` text,
	`dedupe_key` varchar(512) NOT NULL,
	`created_at` timestamp NOT NULL,
	`read_at` timestamp NULL,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_user_id_type_dedupe_key_idx` UNIQUE(`user_id`,`type`,`dedupe_key`)
);
--> statement-breakpoint
CREATE INDEX `notifications_user_id_created_at_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_read_at_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
