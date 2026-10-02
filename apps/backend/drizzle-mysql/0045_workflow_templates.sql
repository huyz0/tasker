-- M42-T01 (ADR-0035): see drizzle-sqlite/0058_workflow_templates.sql.
CREATE TABLE `workflow_templates` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`project_id` varchar(256),
	`name` varchar(256) NOT NULL,
	`description` text NOT NULL,
	`steps` mediumtext NOT NULL,
	`created_at` timestamp NOT NULL,
	`updated_at` timestamp NOT NULL,
	CONSTRAINT `workflow_templates_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `workflow_templates_org_id_created_idx` ON `workflow_templates` (`org_id`,`created_at`);
