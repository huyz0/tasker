-- M39-T01 (ADR-0032): see drizzle-sqlite/0055_approval_gates.sql.
ALTER TABLE `task_status_transitions` ADD `requires_approval` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `transition_approvals` (
	`id` varchar(256) NOT NULL,
	`task_id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256) NOT NULL,
	`from_status` varchar(256) NOT NULL,
	`to_status` varchar(256) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'pending',
	`requested_by_agent_id` varchar(256) NOT NULL,
	`decided_by_user_id` varchar(256),
	`reason` text,
	`created_at` timestamp NOT NULL,
	`decided_at` timestamp NULL,
	CONSTRAINT `transition_approvals_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `transition_approvals_task_id_status_idx` ON `transition_approvals` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `transition_approvals_org_id_status_created_idx` ON `transition_approvals` (`org_id`,`status`,`created_at`);
