ALTER TABLE `organizations` ADD `parent_org_id` text REFERENCES organizations(id);--> statement-breakpoint
CREATE INDEX `organizations_parent_org_id_idx` ON `organizations` (`parent_org_id`);