-- Custom SQL migration file, put your code below! --

-- M22-T03 (ADR-0017). See the SQLite counterpart
-- (0043_task_notes_note_type.sql) for the full reasoning.
ALTER TABLE `task_notes` ADD `note_type` enum('comment','handoff') DEFAULT 'comment' NOT NULL;--> statement-breakpoint
CREATE INDEX `task_notes_note_type_task_id_idx` ON `task_notes` (`note_type`,`task_id`);
