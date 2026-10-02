-- M41-T01 (ADR-0034): a durable summary of what a task came to.
ALTER TABLE `tasks` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_updated_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_agent_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `summary_user_id` text;
