ALTER TABLE schedules ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE schedules ADD COLUMN deleted_at INTEGER;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN slot_key TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN due_at INTEGER;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN actor_json TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN target_kind TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN target_id TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN frozen_inputs TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN lease_token TEXT;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN claimed_until INTEGER;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN next_attempt_at INTEGER;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN started_at INTEGER;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN completed_at INTEGER;
--> statement-breakpoint
CREATE UNIQUE INDEX schedule_runs_slot_unique ON schedule_runs(schedule_id, slot_key);
--> statement-breakpoint
CREATE INDEX schedule_runs_recovery_idx ON schedule_runs(outcome, next_attempt_at);
--> statement-breakpoint
CREATE INDEX schedule_runs_lease_idx ON schedule_runs(outcome, claimed_until);
