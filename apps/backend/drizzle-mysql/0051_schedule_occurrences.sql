ALTER TABLE schedules ADD COLUMN revision int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE schedules ADD COLUMN deleted_at timestamp NULL;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN slot_key varchar(96);
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN due_at timestamp NULL;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN actor_json text;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN target_kind varchar(16);
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN target_id varchar(256);
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN frozen_inputs longtext;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN lease_token varchar(64);
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN claimed_until timestamp NULL;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN attempts int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN next_attempt_at timestamp NULL;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN started_at timestamp NULL;
--> statement-breakpoint
ALTER TABLE schedule_runs ADD COLUMN completed_at timestamp NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX schedule_runs_slot_unique ON schedule_runs(schedule_id, slot_key);
--> statement-breakpoint
CREATE INDEX schedule_runs_recovery_idx ON schedule_runs(outcome, next_attempt_at);
--> statement-breakpoint
CREATE INDEX schedule_runs_lease_idx ON schedule_runs(outcome, claimed_until);
