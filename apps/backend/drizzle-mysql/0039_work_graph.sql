-- M35-T01 (ADR-0028): see drizzle-sqlite/0052_work_graph.sql.
ALTER TABLE `tasks` ADD `priority` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` varchar(256);--> statement-breakpoint
CREATE INDEX `tasks_parent_task_id_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE TABLE `task_links` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`linked_task_id` varchar(256) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`created_by` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_links_task_linked_kind_idx` UNIQUE(`task_id`,`linked_task_id`,`kind`)
);--> statement-breakpoint
CREATE INDEX `task_links_linked_task_id_idx` ON `task_links` (`linked_task_id`,`kind`);
