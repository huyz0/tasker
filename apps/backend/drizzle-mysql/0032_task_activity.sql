CREATE TABLE `task_activity` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`from_status` varchar(256),
	`to_status` varchar(256),
	`from_is_terminal` boolean NOT NULL DEFAULT false,
	`to_is_terminal` boolean NOT NULL DEFAULT false,
	`actor_type` varchar(32) NOT NULL DEFAULT 'system',
	`actor_id` varchar(256),
	`assignee_agent_id` varchar(256),
	`assignee_user_id` varchar(256),
	`occurred_at` timestamp NOT NULL,
	CONSTRAINT `task_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_activity` ADD CONSTRAINT `task_activity_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_activity` ADD CONSTRAINT `task_activity_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_activity_project_kind_occurred_idx` ON `task_activity` (`project_id`,`kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `task_activity_task_occurred_idx` ON `task_activity` (`task_id`,`occurred_at`);
