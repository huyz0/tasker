CREATE TABLE `stalled_claim_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`anchor_at` integer NOT NULL,
	`alerted_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stalled_claim_alerts_task_id_anchor_at_idx` ON `stalled_claim_alerts` (`task_id`,`anchor_at`);