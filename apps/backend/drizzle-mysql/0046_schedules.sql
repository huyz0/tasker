-- M43-T01 (ADR-0036): see drizzle-sqlite/0059_schedules.sql.
ALTER TABLE `tasks` ADD `schedule_id` varchar(256);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`cadence` varchar(16) NOT NULL,
	`weekdays` varchar(64) NOT NULL DEFAULT '[]',
	`day_of_month` int NOT NULL DEFAULT 1,
	`hour_utc` int NOT NULL DEFAULT 9,
	`template_id` varchar(256),
	`task_title` varchar(512),
	`task_description` text,
	`task_priority` int NOT NULL DEFAULT 0,
	`skip_if_open` boolean NOT NULL DEFAULT true,
	`active` boolean NOT NULL DEFAULT true,
	`next_run_at` timestamp NOT NULL,
	`last_run_at` timestamp NULL,
	`last_task_id` varchar(256),
	`last_outcome` varchar(16),
	`created_by` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL,
	CONSTRAINT `schedules_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `schedules_active_next_run_idx` ON `schedules` (`active`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `schedules_project_id_idx` ON `schedules` (`project_id`);--> statement-breakpoint
CREATE TABLE `schedule_runs` (
	`id` varchar(256) NOT NULL,
	`schedule_id` varchar(256) NOT NULL,
	`ran_at` timestamp NOT NULL,
	`outcome` varchar(16) NOT NULL,
	`task_id` varchar(256),
	`detail` text,
	`trigger` varchar(16) NOT NULL,
	CONSTRAINT `schedule_runs_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `schedule_runs_schedule_id_ran_idx` ON `schedule_runs` (`schedule_id`,`ran_at`);
