CREATE TABLE `stalled_claim_alerts` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`anchor_at` timestamp NOT NULL,
	`alerted_at` timestamp NOT NULL,
	CONSTRAINT `stalled_claim_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `stalled_claim_alerts_task_id_anchor_at_idx` UNIQUE(`task_id`,`anchor_at`)
);
--> statement-breakpoint
ALTER TABLE `stalled_claim_alerts` ADD CONSTRAINT `stalled_claim_alerts_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE no action ON UPDATE no action;