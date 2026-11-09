ALTER TABLE task_artifact_links ADD COLUMN linked_at timestamp;
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_kind varchar(16);
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_id varchar(256);
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN linked_by_name varchar(256);
