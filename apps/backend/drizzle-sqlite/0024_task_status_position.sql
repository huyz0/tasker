-- Statuses are a pipeline (todo -> in progress -> done), and until now their
-- order was whatever the database happened to return. The backfill uses rowid
-- so existing rows keep the order they are already displayed in.
ALTER TABLE `task_statuses` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `task_statuses` SET `position` = (
  SELECT COUNT(*) FROM `task_statuses` AS earlier
  WHERE earlier.task_type_id = `task_statuses`.task_type_id
    AND earlier.rowid < `task_statuses`.rowid
);
