CREATE TABLE `domain_events` (
  `id` text PRIMARY KEY NOT NULL,
  `subject` text NOT NULL,
  `org_id` text,
  `project_id` text,
  `payload` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `broker_required` integer NOT NULL,
  `delivered_at` integer,
  `next_attempt_at` integer NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `lease_token` text,
  `claimed_until` integer,
  `last_error` text
);
--> statement-breakpoint
CREATE INDEX `domain_events_pending_idx` ON `domain_events` (`delivered_at`,`next_attempt_at`,`claimed_until`);
--> statement-breakpoint
CREATE INDEX `domain_events_org_created_idx` ON `domain_events` (`org_id`,`created_at`);
