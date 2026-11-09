ALTER TABLE `audit_log` ADD COLUMN `event_id` varchar(256);
--> statement-breakpoint
UPDATE `audit_log` SET `event_id` = CONCAT('legacy:', `stream_seq`);
--> statement-breakpoint
ALTER TABLE `audit_log` DROP INDEX `audit_log_stream_seq_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_event_id_unique` ON `audit_log` (`event_id`);
