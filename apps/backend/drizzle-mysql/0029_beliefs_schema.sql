-- M21-T04 (ADR-0014/0015/0016). See the SQLite counterpart
-- (0042_beliefs_schema.sql) for the full reasoning. beliefs/
-- belief_relations/belief_promotions, plus a `FULLTEXT` index on
-- beliefs.statement matching 0012_fulltext_search_index.sql's pattern -
-- InnoDB maintains it inside the same transaction as the write, no
-- triggers needed on this dialect. Not wired into search.handler.ts yet -
-- that's M21-T06.
--
-- Hand-written, not `drizzle-kit generate`d, for the same reason as the
-- SQLite migration: keeping both dialects' migrations produced the same
-- way rather than one generated and one hand-written for different reasons.

CREATE TABLE `beliefs` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`scope_type` varchar(32) NOT NULL,
	`scope_id` varchar(256) NOT NULL,
	`statement` varchar(4096) NOT NULL,
	`confidence` varchar(16) NOT NULL DEFAULT 'medium',
	`status` varchar(16) NOT NULL DEFAULT 'active',
	`supersedes_belief_id` varchar(256),
	`source_kind` varchar(16) NOT NULL,
	`source_agent_id` varchar(256),
	`source_user_id` varchar(256),
	`source_task_id` varchar(256),
	`source_comment_id` varchar(256),
	`source_task_note_id` varchar(256),
	`source_artifact_id` varchar(256),
	`promoted_from_scope_type` varchar(32),
	`promoted_from_scope_id` varchar(256),
	`promoted_by` varchar(256),
	`promoted_at` timestamp,
	`embedding` mediumtext,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `beliefs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `beliefs_scope_idx` ON `beliefs` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `beliefs_org_id_idx` ON `beliefs` (`org_id`);--> statement-breakpoint
CREATE INDEX `beliefs_status_idx` ON `beliefs` (`status`);--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_supersedes_belief_id_beliefs_id_fk` FOREIGN KEY (`supersedes_belief_id`) REFERENCES `beliefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_agent_id_agents_id_fk` FOREIGN KEY (`source_agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_user_id_users_id_fk` FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_task_id_tasks_id_fk` FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_comment_id_comments_id_fk` FOREIGN KEY (`source_comment_id`) REFERENCES `comments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_task_note_id_task_notes_id_fk` FOREIGN KEY (`source_task_note_id`) REFERENCES `task_notes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_source_artifact_id_artifacts_id_fk` FOREIGN KEY (`source_artifact_id`) REFERENCES `artifacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `beliefs` ADD CONSTRAINT `beliefs_promoted_by_users_id_fk` FOREIGN KEY (`promoted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE `belief_relations` (
	`id` varchar(256) NOT NULL,
	`belief_a_id` varchar(256) NOT NULL,
	`belief_b_id` varchar(256) NOT NULL,
	`relation_type` varchar(32) NOT NULL,
	`created_by` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `belief_relations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `belief_relations_belief_a_id_idx` ON `belief_relations` (`belief_a_id`);--> statement-breakpoint
CREATE INDEX `belief_relations_belief_b_id_idx` ON `belief_relations` (`belief_b_id`);--> statement-breakpoint
ALTER TABLE `belief_relations` ADD CONSTRAINT `belief_relations_belief_a_id_beliefs_id_fk` FOREIGN KEY (`belief_a_id`) REFERENCES `beliefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `belief_relations` ADD CONSTRAINT `belief_relations_belief_b_id_beliefs_id_fk` FOREIGN KEY (`belief_b_id`) REFERENCES `beliefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `belief_relations` ADD CONSTRAINT `belief_relations_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE `belief_promotions` (
	`id` varchar(256) NOT NULL,
	`belief_id` varchar(256) NOT NULL,
	`from_scope_type` varchar(32) NOT NULL,
	`from_scope_id` varchar(256) NOT NULL,
	`to_scope_type` varchar(32) NOT NULL,
	`to_scope_id` varchar(256) NOT NULL,
	`promoted_by` varchar(256) NOT NULL,
	`promoted_at` timestamp NOT NULL DEFAULT (now()),
	`note` varchar(1024),
	CONSTRAINT `belief_promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `belief_promotions_belief_id_idx` ON `belief_promotions` (`belief_id`);--> statement-breakpoint
ALTER TABLE `belief_promotions` ADD CONSTRAINT `belief_promotions_belief_id_beliefs_id_fk` FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `belief_promotions` ADD CONSTRAINT `belief_promotions_promoted_by_users_id_fk` FOREIGN KEY (`promoted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE FULLTEXT INDEX `beliefs_fts_idx` ON `beliefs` (`statement`);
