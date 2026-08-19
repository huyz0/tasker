-- M22-T03 (ADR-0017). A handoff note is a TaskNote with note_type: 'handoff'
-- - no new table. Existing rows all backfill to 'comment' via the column
-- default, since that's what they already were before this distinction
-- existed. SQLite has no enum type; "comment" | "handoff" is enforced in
-- Zod only, at the handler boundary.
ALTER TABLE `task_notes` ADD COLUMN `note_type` text DEFAULT 'comment' NOT NULL;--> statement-breakpoint
CREATE INDEX `task_notes_note_type_task_id_idx` ON `task_notes` (`note_type`,`task_id`);
