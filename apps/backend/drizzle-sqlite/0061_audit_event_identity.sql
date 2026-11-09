ALTER TABLE `audit_log` ADD COLUMN `event_id` text;
--> statement-breakpoint
UPDATE `audit_log` SET `event_id` = 'legacy:' || CAST(`stream_seq` AS TEXT);
--> statement-breakpoint
DROP INDEX `audit_log_stream_seq_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_event_id_unique` ON `audit_log` (`event_id`);
