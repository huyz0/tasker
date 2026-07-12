ALTER TABLE `project_templates` ADD `root_task_type_id` text REFERENCES task_types(id);--> statement-breakpoint
ALTER TABLE `task_types` ADD `parent_id` text REFERENCES task_types(id);