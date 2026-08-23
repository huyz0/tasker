-- Custom SQL migration file, put your code below! --

-- M26-T04: repair for databases that silently skipped `audit_log`.
-- See the sqlite sibling for the full account of how they were damaged.
--
-- One statement, not five: MySQL has no `CREATE INDEX IF NOT EXISTS`, so the
-- indexes and constraints are declared inline in the table definition. That
-- makes the whole repair idempotent through the single `IF NOT EXISTS` on the
-- table itself — on a healthy database nothing here runs at all.
CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256),
	`subject` varchar(256) NOT NULL,
	`actor_type` varchar(32) NOT NULL DEFAULT 'system',
	`actor_id` varchar(256),
	`request_id` varchar(256),
	`payload` longtext NOT NULL,
	`stream_seq` bigint NOT NULL,
	`occurred_at` timestamp NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_log_stream_seq_unique` UNIQUE(`stream_seq`),
	INDEX `audit_log_org_idx` (`org_id`,`occurred_at`),
	INDEX `audit_log_subject_idx` (`subject`),
	INDEX `audit_log_actor_idx` (`actor_id`),
	CONSTRAINT `audit_log_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action
);
