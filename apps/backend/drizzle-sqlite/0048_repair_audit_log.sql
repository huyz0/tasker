-- Custom SQL migration file, put your code below! --

-- M26-T04: repair for databases that silently skipped `audit_log`.
--
-- 0044 was stamped with a `when` nine days earlier than its own predecessor,
-- and `applyEmbeddedMigrations` selects pending work with
-- `m.when > lastAppliedAt`. Any database that had already applied 0043 never
-- saw 0044 — and then went on to apply 0045-0047 quite happily, which moved
-- its watermark past the slot 0044 occupies even after correcting it. So
-- correcting the `when` fixes every future migration and reaches none of the
-- databases already damaged. This does.
--
-- Idempotent by construction: on a healthy database — including a fresh one,
-- where 0044 has just run — every statement here is a no-op.
CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`subject` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`request_id` text,
	`payload` text NOT NULL,
	`stream_seq` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_org_idx` ON `audit_log` (`org_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_subject_idx` ON `audit_log` (`subject`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `audit_log_stream_seq_unique` ON `audit_log` (`stream_seq`);
