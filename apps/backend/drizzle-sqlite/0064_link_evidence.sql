ALTER TABLE task_artifact_links ADD COLUMN linked_at INTEGER;
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_kind TEXT;
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_id TEXT;
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_name TEXT;
