-- M37-T01 (ADR-0030): webhook subscriptions and their delivery outbox.
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text,
	`url` text NOT NULL,
	`secret_encrypted` text NOT NULL,
	`events` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`disabled_reason` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`last_delivery_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `webhooks_org_id_idx` ON `webhooks` (`org_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claimed_until` integer,
	`last_status_code` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`delivered_at` integer
);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_status_next_attempt_idx` ON `webhook_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_webhook_id_created_at_idx` ON `webhook_deliveries` (`webhook_id`,`created_at`);
