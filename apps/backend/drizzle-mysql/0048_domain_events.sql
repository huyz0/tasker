CREATE TABLE `domain_events` (
  `id` varchar(256) PRIMARY KEY NOT NULL,
  `subject` varchar(256) NOT NULL,
  `org_id` varchar(256),
  `project_id` varchar(256),
  `payload` longtext NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL,
  `broker_required` boolean NOT NULL,
  `delivered_at` timestamp NULL,
  `next_attempt_at` timestamp NOT NULL,
  `attempts` int DEFAULT 0 NOT NULL,
  `lease_token` varchar(128),
  `claimed_until` timestamp NULL,
  `last_error` text
);
--> statement-breakpoint
CREATE INDEX `domain_events_pending_idx` ON `domain_events` (`delivered_at`,`next_attempt_at`,`claimed_until`);
--> statement-breakpoint
CREATE INDEX `domain_events_org_created_idx` ON `domain_events` (`org_id`,`created_at`);
