CREATE TABLE `audit_log` (
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
	-- See the sqlite migration: makes an at-least-once redelivery a no-op
	-- rather than a duplicate row.
	CONSTRAINT `audit_log_stream_seq_unique` UNIQUE(`stream_seq`)
);
--> statement-breakpoint
CREATE INDEX `audit_log_org_idx` ON `audit_log` (`org_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_subject_idx` ON `audit_log` (`subject`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
