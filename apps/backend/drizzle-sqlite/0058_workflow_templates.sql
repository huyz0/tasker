-- M42-T01 (ADR-0035): reusable workflow templates.
CREATE TABLE `workflow_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`steps` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `workflow_templates_org_id_created_idx` ON `workflow_templates` (`org_id`,`created_at`);
