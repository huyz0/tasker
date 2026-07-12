CREATE TABLE `agent_roles` (
	`id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`system_prompt` varchar(4096) NOT NULL,
	`capabilities` varchar(2048) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `agent_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`agent_role_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` varchar(256) NOT NULL,
	`folder_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` varchar(1024),
	`content` mediumtext,
	`content_type` varchar(128) NOT NULL DEFAULT 'text/markdown',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` varchar(256) NOT NULL,
	`entity_id` varchar(256) NOT NULL,
	`entity_type` enum('task','artifact') NOT NULL,
	`user_id` varchar(256),
	`agent_id` varchar(256),
	`content` varchar(4096) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entity_labels` (
	`id` varchar(256) NOT NULL,
	`entity_id` varchar(256) NOT NULL,
	`entity_type` enum('task','artifact') NOT NULL,
	`label_id` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entity_labels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`parent_id` varchar(256),
	`name` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`email` varchar(256) NOT NULL,
	`invited_by` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`color` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `labels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`org_id` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organization_members_org_id_user_id_pk` PRIMARY KEY(`org_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`slug` varchar(256) NOT NULL,
	`parent_org_id` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	`bin_retention_days` int,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `project_templates` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` varchar(1024),
	`root_task_type_id` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`template_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`key_code` varchar(32) NOT NULL DEFAULT '',
	`next_task_number` int NOT NULL DEFAULT 1,
	`owner_id` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `remote_pull_requests` (
	`id` varchar(256) NOT NULL,
	`repository_link_id` varchar(256) NOT NULL,
	`task_id` varchar(256),
	`remote_pr_id` varchar(256) NOT NULL,
	`title` varchar(512) NOT NULL,
	`status` enum('open','closed','merged','draft') NOT NULL,
	`url` varchar(1024) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `remote_pull_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repository_links` (
	`id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`provider` enum('github','bitbucket') NOT NULL,
	`remote_name` varchar(256) NOT NULL,
	`access_token_encrypted` varchar(2048) NOT NULL,
	`auth_email` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repository_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_artifact_links` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`artifact_id` varchar(256) NOT NULL,
	CONSTRAINT `task_artifact_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_assignments` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`agent_id` varchar(256),
	`user_id` varchar(256),
	CONSTRAINT `task_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_notes` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`agent_id` varchar(256) NOT NULL,
	`content` varchar(8192) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_reviewers` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	CONSTRAINT `task_reviewers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_status_transitions` (
	`id` varchar(256) NOT NULL,
	`task_type_id` varchar(256) NOT NULL,
	`from_status_id` varchar(256) NOT NULL,
	`to_status_id` varchar(256) NOT NULL,
	CONSTRAINT `task_status_transitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_statuses` (
	`id` varchar(256) NOT NULL,
	`task_type_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	CONSTRAINT `task_statuses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_types` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256),
	`parent_id` varchar(256),
	`name` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`display_id` varchar(64) NOT NULL DEFAULT '',
	`task_type_id` varchar(256),
	`created_by` varchar(256),
	`title` varchar(512) NOT NULL,
	`status` varchar(256) NOT NULL,
	`description` varchar(4096),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schema_migrations_test` (
	`id` varchar(256) NOT NULL,
	CONSTRAINT `schema_migrations_test_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(256) NOT NULL,
	`email` varchar(256) NOT NULL,
	`name` varchar(256),
	`avatar_url` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_agent_role_id_agent_roles_id_fk` FOREIGN KEY (`agent_role_id`) REFERENCES `agent_roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entity_labels` ADD CONSTRAINT `entity_labels_label_id_labels_id_fk` FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `folders` ADD CONSTRAINT `folders_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_users_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `labels` ADD CONSTRAINT `labels_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_parent_org_id_organizations_id_fk` FOREIGN KEY (`parent_org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_templates` ADD CONSTRAINT `project_templates_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_templates` ADD CONSTRAINT `project_templates_root_task_type_id_task_types_id_fk` FOREIGN KEY (`root_task_type_id`) REFERENCES `task_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_template_id_project_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `project_templates`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `remote_pull_requests` ADD CONSTRAINT `remote_pull_requests_repository_link_id_repository_links_id_fk` FOREIGN KEY (`repository_link_id`) REFERENCES `repository_links`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `remote_pull_requests` ADD CONSTRAINT `remote_pull_requests_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repository_links` ADD CONSTRAINT `repository_links_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_artifact_links` ADD CONSTRAINT `task_artifact_links_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_artifact_links` ADD CONSTRAINT `task_artifact_links_artifact_id_artifacts_id_fk` FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_notes` ADD CONSTRAINT `task_notes_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_notes` ADD CONSTRAINT `task_notes_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_reviewers` ADD CONSTRAINT `task_reviewers_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_reviewers` ADD CONSTRAINT `task_reviewers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_status_transitions` ADD CONSTRAINT `task_status_transitions_task_type_id_task_types_id_fk` FOREIGN KEY (`task_type_id`) REFERENCES `task_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_status_transitions` ADD CONSTRAINT `task_status_transitions_from_status_id_task_statuses_id_fk` FOREIGN KEY (`from_status_id`) REFERENCES `task_statuses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_status_transitions` ADD CONSTRAINT `task_status_transitions_to_status_id_task_statuses_id_fk` FOREIGN KEY (`to_status_id`) REFERENCES `task_statuses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_statuses` ADD CONSTRAINT `task_statuses_task_type_id_task_types_id_fk` FOREIGN KEY (`task_type_id`) REFERENCES `task_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_types` ADD CONSTRAINT `task_types_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_types` ADD CONSTRAINT `task_types_parent_id_task_types_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `task_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_task_type_id_task_types_id_fk` FOREIGN KEY (`task_type_id`) REFERENCES `task_types`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `organizations_parent_org_id_idx` ON `organizations` (`parent_org_id`);