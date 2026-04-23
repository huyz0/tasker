CREATE TABLE `remote_pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_link_id` text NOT NULL,
	`task_id` text,
	`remote_pr_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`url` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`repository_link_id`) REFERENCES `repository_links`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repository_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`remote_name` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
