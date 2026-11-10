CREATE TABLE task_claim_attempts (
  id text PRIMARY KEY NOT NULL,
  task_id text NOT NULL REFERENCES tasks(id),
  org_id text NOT NULL REFERENCES organizations(id),
  owner_kind text NOT NULL,
  owner_id text NOT NULL,
  owner_name text NOT NULL,
  claimed_at integer NOT NULL,
  external_run_id text,
  released_at integer,
  release_reason text,
  released_by_kind text,
  released_by_id text
);
--> statement-breakpoint
CREATE INDEX task_claim_attempts_task_claimed_idx ON task_claim_attempts(task_id, claimed_at, id);
