ALTER TABLE task_notes ADD COLUMN attempt_id TEXT REFERENCES task_claim_attempts(id);
--> statement-breakpoint
CREATE INDEX task_notes_attempt_id_idx ON task_notes(attempt_id);
--> statement-breakpoint
ALTER TABLE usage_records ADD COLUMN attempt_id TEXT REFERENCES task_claim_attempts(id);
--> statement-breakpoint
CREATE INDEX usage_records_attempt_id_idx ON usage_records(attempt_id);
--> statement-breakpoint
ALTER TABLE task_artifact_links ADD COLUMN attempt_id TEXT REFERENCES task_claim_attempts(id);
--> statement-breakpoint
CREATE INDEX task_artifact_links_attempt_id_idx ON task_artifact_links(attempt_id);
