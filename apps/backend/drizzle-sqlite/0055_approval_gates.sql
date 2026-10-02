-- M39-T01 (ADR-0032): approval gates on task-type transitions.
ALTER TABLE `task_status_transitions` ADD `requires_approval` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `transition_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by_agent_id` text NOT NULL,
	`decided_by_user_id` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer
);--> statement-breakpoint
CREATE INDEX `transition_approvals_task_id_status_idx` ON `transition_approvals` (`task_id`,`status`);--> statement-breakpoint
CREATE INDEX `transition_approvals_org_id_status_created_idx` ON `transition_approvals` (`org_id`,`status`,`created_at`);
