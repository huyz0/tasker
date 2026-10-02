-- M37-T01 (ADR-0030): see drizzle-sqlite/0053_webhooks.sql.
CREATE TABLE `webhooks` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256),
	`url` varchar(2048) NOT NULL,
	`secret_encrypted` text NOT NULL,
	`events` text NOT NULL,
	`description` varchar(512) NOT NULL DEFAULT '',
	`active` boolean NOT NULL DEFAULT true,
	`consecutive_failures` int NOT NULL DEFAULT 0,
	`disabled_reason` text,
	`created_by` varchar(256),
	`created_at` timestamp NOT NULL,
	`last_delivery_at` timestamp NULL,
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
ALTER TABLE `webhooks` ADD CONSTRAINT `webhooks_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `webhooks_org_id_idx` ON `webhooks` (`org_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` varchar(256) NOT NULL,
	`webhook_id` varchar(256) NOT NULL,
	`event_id` varchar(256) NOT NULL,
	`event_type` varchar(128) NOT NULL,
	`payload` mediumtext NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`next_attempt_at` timestamp NOT NULL,
	`claimed_until` timestamp NULL,
	`last_status_code` int,
	`last_error` text,
	`created_at` timestamp NOT NULL,
	`delivered_at` timestamp NULL,
	CONSTRAINT `webhook_deliveries_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_status_next_attempt_idx` ON `webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_webhook_id_created_at_idx` ON `webhook_deliveries` (`webhook_id`,`created_at`);
