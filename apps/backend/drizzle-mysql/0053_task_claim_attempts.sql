CREATE TABLE task_claim_attempts (
  id varchar(256) PRIMARY KEY NOT NULL,
  task_id varchar(256) NOT NULL,
  org_id varchar(256) NOT NULL,
  owner_kind varchar(16) NOT NULL,
  owner_id varchar(256) NOT NULL,
  owner_name varchar(256) NOT NULL,
  claimed_at timestamp NOT NULL,
  external_run_id varchar(256),
  released_at timestamp NULL,
  release_reason varchar(32),
  released_by_kind varchar(16),
  released_by_id varchar(256),
  CONSTRAINT task_claim_attempts_task_fk FOREIGN KEY(task_id) REFERENCES tasks(id),
  CONSTRAINT task_claim_attempts_org_fk FOREIGN KEY(org_id) REFERENCES organizations(id)
);
--> statement-breakpoint
CREATE INDEX task_claim_attempts_task_claimed_idx ON task_claim_attempts(task_id, claimed_at, id);
