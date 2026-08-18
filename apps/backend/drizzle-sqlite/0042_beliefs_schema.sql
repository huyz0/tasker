-- M21-T04 (ADR-0014/0015/0016). beliefs/belief_relations/belief_promotions,
-- plus a contentless FTS5 index on beliefs.statement following
-- 0025_fts5_search_index.sql/0026_fts5_projects_agents_comments.sql's exact
-- pattern: the index is maintained by triggers, not by the application, so
-- the update sits inside the same transaction as the write and cannot be
-- forgotten by a future call site. Not wired into search.handler.ts yet -
-- that's M21-T06; this migration only makes the index exist and stay
-- current from the moment the first belief is written.
--
-- Hand-written, not `drizzle-kit generate`d: this project's drizzle-sqlite
-- snapshot lineage has been drifted from the actual applied-migration
-- history since M13 (a known, previously-flagged gotcha) - running
-- `generate` against it produced a migration that tried to recreate a dozen
-- already-existing tables from a stale baseline. Discarded; every CREATE
-- TABLE/INDEX below is written directly from schema.sqlite.ts instead.

CREATE TABLE `beliefs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`statement` text NOT NULL,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`supersedes_belief_id` text,
	`source_kind` text NOT NULL,
	`source_agent_id` text,
	`source_user_id` text,
	`source_task_id` text,
	`source_comment_id` text,
	`source_task_note_id` text,
	`source_artifact_id` text,
	`promoted_from_scope_type` text,
	`promoted_from_scope_id` text,
	`promoted_by` text,
	`promoted_at` integer,
	`embedding` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supersedes_belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_task_note_id`) REFERENCES `task_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `beliefs_scope_idx` ON `beliefs` (`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `beliefs_org_id_idx` ON `beliefs` (`org_id`);--> statement-breakpoint
CREATE INDEX `beliefs_status_idx` ON `beliefs` (`status`);--> statement-breakpoint
CREATE TABLE `belief_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`belief_a_id` text NOT NULL,
	`belief_b_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`belief_a_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`belief_b_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `belief_relations_belief_a_id_idx` ON `belief_relations` (`belief_a_id`);--> statement-breakpoint
CREATE INDEX `belief_relations_belief_b_id_idx` ON `belief_relations` (`belief_b_id`);--> statement-breakpoint
CREATE TABLE `belief_promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`belief_id` text NOT NULL,
	`from_scope_type` text NOT NULL,
	`from_scope_id` text NOT NULL,
	`to_scope_type` text NOT NULL,
	`to_scope_id` text NOT NULL,
	`promoted_by` text NOT NULL,
	`promoted_at` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`belief_id`) REFERENCES `beliefs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `belief_promotions_belief_id_idx` ON `belief_promotions` (`belief_id`);--> statement-breakpoint

CREATE VIRTUAL TABLE `beliefs_fts` USING fts5(
  statement,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

CREATE TRIGGER `beliefs_fts_insert` AFTER INSERT ON `beliefs` BEGIN
  INSERT INTO `beliefs_fts`(rowid, statement)
    VALUES (new.rowid, coalesce(new.statement, ''));
END;--> statement-breakpoint

CREATE TRIGGER `beliefs_fts_delete` AFTER DELETE ON `beliefs` BEGIN
  INSERT INTO `beliefs_fts`(`beliefs_fts`, rowid, statement)
    VALUES ('delete', old.rowid, coalesce(old.statement, ''));
END;--> statement-breakpoint

CREATE TRIGGER `beliefs_fts_update` AFTER UPDATE ON `beliefs` BEGIN
  INSERT INTO `beliefs_fts`(`beliefs_fts`, rowid, statement)
    VALUES ('delete', old.rowid, coalesce(old.statement, ''));
  INSERT INTO `beliefs_fts`(rowid, statement)
    VALUES (new.rowid, coalesce(new.statement, ''));
END;
