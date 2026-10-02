-- M35-T01 (ADR-0028): priority, parent and the task link graph.
ALTER TABLE `tasks` ADD `priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` text;--> statement-breakpoint
CREATE INDEX `tasks_parent_task_id_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE TABLE `task_links` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`linked_task_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `task_links_task_linked_kind_idx` ON `task_links` (`task_id`,`linked_task_id`,`kind`);--> statement-breakpoint
CREATE INDEX `task_links_linked_task_id_idx` ON `task_links` (`linked_task_id`,`kind`);
