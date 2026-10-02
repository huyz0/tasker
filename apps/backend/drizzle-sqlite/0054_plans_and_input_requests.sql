-- M38-T01 (ADR-0031): agent plans on tasks, and input requests.
ALTER TABLE `tasks` ADD `plan` text;--> statement-breakpoint
CREATE TABLE `input_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`question` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`asked_by_agent_id` text,
	`asked_by_user_id` text,
	`answer` text,
	`answered_by_user_id` text,
	`created_at` integer NOT NULL,
	`answered_at` integer
);--> statement-breakpoint
CREATE INDEX `input_requests_task_id_status_idx` ON `input_requests` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `input_requests_org_id_status_created_idx` ON `input_requests` (`org_id`,`status`,`created_at`);
