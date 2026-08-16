-- Custom SQL migration file, put your code below! --

-- M10-T02 (ADR-0013). See the SQLite counterpart for the full reasoning.
CREATE TABLE `permissions` (
	`key` varchar(64) NOT NULL,
	`description` varchar(512) NOT NULL,
	CONSTRAINT `permissions_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256),
	`name` varchar(256) NOT NULL,
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` varchar(256) NOT NULL,
	`permission_key` varchar(64) NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_key_pk` PRIMARY KEY(`role_id`,`permission_key`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_members_team_id_user_id_pk` PRIMARY KEY(`team_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `grants` (
	`id` varchar(256) NOT NULL,
	`subject_type` enum('user','team') NOT NULL,
	`subject_id` varchar(256) NOT NULL,
	`scope_type` enum('organization','team','project') NOT NULL,
	`scope_id` varchar(256) NOT NULL,
	`role_id` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `grants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `roles` ADD CONSTRAINT `roles_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_key_permissions_key_fk` FOREIGN KEY (`permission_key`) REFERENCES `permissions`(`key`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `grants` ADD CONSTRAINT `grants_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `roles_org_id_idx` ON `roles` (`org_id`);
--> statement-breakpoint
CREATE INDEX `team_members_user_id_idx` ON `team_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `teams_org_id_idx` ON `teams` (`org_id`);
--> statement-breakpoint
CREATE INDEX `grants_subject_idx` ON `grants` (`subject_type`,`subject_id`);
--> statement-breakpoint
CREATE INDEX `grants_scope_idx` ON `grants` (`scope_type`,`scope_id`);
