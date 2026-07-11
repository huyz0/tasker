ALTER TABLE `agents` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `folders` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `organizations` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deleted_at` integer;