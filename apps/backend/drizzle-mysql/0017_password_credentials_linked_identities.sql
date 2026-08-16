-- Custom SQL migration file, put your code below! --

-- M13-T03. See the SQLite counterpart for the full reasoning.
CREATE TABLE `linked_identities` (
	`id` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`provider` enum('google') NOT NULL,
	`provider_user_id` varchar(256) NOT NULL,
	`linked_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `linked_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `linked_identities_provider_identity_idx` UNIQUE(`provider`,`provider_user_id`)
);
--> statement-breakpoint
CREATE TABLE `password_credentials` (
	`user_id` varchar(256) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`failed_attempts` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`must_change_password` boolean NOT NULL DEFAULT false,
	CONSTRAINT `password_credentials_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `linked_identities` ADD CONSTRAINT `linked_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_credentials` ADD CONSTRAINT `password_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `linked_identities_user_id_idx` ON `linked_identities` (`user_id`);
