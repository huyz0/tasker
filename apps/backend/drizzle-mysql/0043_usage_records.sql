-- M40-T01 (ADR-0033): see drizzle-sqlite/0056_usage_records.sql.
CREATE TABLE `usage_records` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`agent_id` varchar(256),
	`user_id` varchar(256),
	`model_name` varchar(100) NOT NULL DEFAULT '',
	`input_tokens` bigint NOT NULL DEFAULT 0,
	`output_tokens` bigint NOT NULL DEFAULT 0,
	`cost_micros` bigint NOT NULL DEFAULT 0,
	`idempotency_key` varchar(256),
	`created_at` timestamp NOT NULL,
	CONSTRAINT `usage_records_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `usage_records_task_id_created_idx` ON `usage_records` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_records_org_id_created_idx` ON `usage_records` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `usage_records_project_id_created_idx` ON `usage_records` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `usage_records_task_id_key_idx` ON `usage_records` (`task_id`,`idempotency_key`);
