ALTER TABLE `projects` ADD `key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `next_task_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `display_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill pre-existing rows created before display IDs existed. New rows
-- get a proper key/displayId from the application at creation time; this
-- only covers rows that predate this migration.
UPDATE `projects` SET `key` = upper(substr(replace(`id`, '-', ''), 1, 6)) WHERE `key` = '';--> statement-breakpoint
UPDATE `tasks` SET `display_id` = `id` WHERE `display_id` = '';