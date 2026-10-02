-- M38-T01 (ADR-0031): see drizzle-sqlite/0054_plans_and_input_requests.sql.
ALTER TABLE `tasks` ADD `plan` text;--> statement-breakpoint
CREATE TABLE `input_requests` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'open',
	`asked_by_agent_id` varchar(256),
	`asked_by_user_id` varchar(256),
	`answer` text,
	`answered_by_user_id` varchar(256),
	`created_at` timestamp NOT NULL,
	`answered_at` timestamp NULL,
	CONSTRAINT `input_requests_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `input_requests_task_id_status_idx` ON `input_requests` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `input_requests_org_id_status_created_idx` ON `input_requests` (`org_id`,`status`,`created_at`);
