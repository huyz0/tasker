-- See the sqlite migration of the same name. MySQL has no rowid, so the
-- backfill orders by id, which is stable and matches insertion order closely
-- enough for a column that had no order at all before.
ALTER TABLE `task_statuses` ADD `position` int DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `task_statuses` AS s
JOIN (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY task_type_id ORDER BY id) - 1 AS pos
  FROM `task_statuses`
) AS ranked ON ranked.id = s.id
SET s.position = ranked.pos;
