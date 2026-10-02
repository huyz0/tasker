-- M33-T01 (ADR-0027): how an assignment was made. 'claim' rows were taken by
-- their holder through ClaimTask and may be released by that holder; 'assign'
-- rows were given by a human and may not. Existing rows default to 'assign',
-- the conservative reading.
ALTER TABLE `task_assignments` ADD `source` text DEFAULT 'assign' NOT NULL;--> statement-breakpoint
-- ...and become 'claim' where the activity log shows that holder claimed the
-- task. Activity is best-effort, so this can only under-count claims - never
-- make an assignment a human made releasable.
UPDATE `task_assignments` SET `source` = 'claim'
WHERE EXISTS (
  SELECT 1 FROM `task_activity` a
  WHERE a.`task_id` = `task_assignments`.`task_id` AND a.`kind` = 'claimed'
    AND ((`task_assignments`.`agent_id` IS NOT NULL AND a.`assignee_agent_id` = `task_assignments`.`agent_id`)
      OR (`task_assignments`.`user_id` IS NOT NULL AND a.`assignee_user_id` = `task_assignments`.`user_id`))
);
