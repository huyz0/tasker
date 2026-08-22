CREATE TABLE `task_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`from_is_terminal` integer DEFAULT false NOT NULL,
	`to_is_terminal` integer DEFAULT false NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`assignee_agent_id` text,
	`assignee_user_id` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_activity_project_kind_occurred_idx` ON `task_activity` (`project_id`,`kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `task_activity_task_occurred_idx` ON `task_activity` (`task_id`,`occurred_at`);
