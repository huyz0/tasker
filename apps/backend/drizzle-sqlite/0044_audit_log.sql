CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`subject` text NOT NULL,
	`actor_type` text DEFAULT 'system' NOT NULL,
	`actor_id` text,
	`request_id` text,
	`payload` text NOT NULL,
	`stream_seq` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_org_idx` ON `audit_log` (`org_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_log_subject_idx` ON `audit_log` (`subject`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
-- The projector is at-least-once: JetStream redelivers anything unacked, so a
-- crash between write and ack replays the event. This makes that replay a
-- no-op instead of a duplicate audit row.
CREATE UNIQUE INDEX `audit_log_stream_seq_unique` ON `audit_log` (`stream_seq`);
