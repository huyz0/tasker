-- M33-T01 (ADR-0027): see drizzle-sqlite/0051_task_assignment_source.sql.
ALTER TABLE `task_assignments` ADD `source` varchar(16) DEFAULT 'assign' NOT NULL;--> statement-breakpoint
UPDATE `task_assignments` ta
JOIN (
  SELECT DISTINCT `task_id`, `assignee_agent_id`, `assignee_user_id` FROM `task_activity` WHERE `kind` = 'claimed'
) a ON a.`task_id` = ta.`task_id`
  AND ((ta.`agent_id` IS NOT NULL AND a.`assignee_agent_id` = ta.`agent_id`)
    OR (ta.`user_id` IS NOT NULL AND a.`assignee_user_id` = ta.`user_id`))
SET ta.`source` = 'claim';
