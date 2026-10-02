-- M43-T01 (ADR-0036): recurring work.
ALTER TABLE `tasks` ADD `schedule_id` text;--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`cadence` text NOT NULL,
	`weekdays` text DEFAULT '[]' NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`hour_utc` integer DEFAULT 9 NOT NULL,
	`template_id` text,
	`task_title` text,
	`task_description` text,
	`task_priority` integer DEFAULT 0 NOT NULL,
	`skip_if_open` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`last_task_id` text,
	`last_outcome` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `schedules_active_next_run_idx` ON `schedules` (`active`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `schedules_project_id_idx` ON `schedules` (`project_id`);--> statement-breakpoint
CREATE TABLE `schedule_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`ran_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`task_id` text,
	`detail` text,
	`trigger` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `schedule_runs_schedule_id_ran_idx` ON `schedule_runs` (`schedule_id`,`ran_at`);
