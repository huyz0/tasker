-- M41-T01 (ADR-0034): see drizzle-sqlite/0057_task_summaries.sql.
ALTER TABLE `tasks` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_updated_at` timestamp NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_agent_id` varchar(256);--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_user_id` varchar(256);
