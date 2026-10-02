-- M40-T01 (ADR-0033): what agents report their work on a task cost.
CREATE TABLE `usage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text,
	`user_id` text,
	`model_name` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `usage_records_task_id_created_idx` ON `usage_records` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_records_org_id_created_idx` ON `usage_records` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_records_project_id_created_idx` ON `usage_records` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_records_task_id_key_idx` ON `usage_records` (`task_id`,`idempotency_key`);
