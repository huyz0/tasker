-- Custom SQL migration file, put your code below! --

-- M24-T03 (ADR-0020). See the SQLite counterpart
-- (0046_backfill_task_activity.sql) for the full reasoning: truthful
-- backfill only — current status as the day-0 baseline for non-archived
-- tasks, real timestamps for the carried-over note/handoff/comment history,
-- deterministic ids so INSERT IGNORE makes every statement idempotent.
INSERT IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  CONCAT('act-', t.id), t.id, t.project_id, 'created', NULL, t.status, 0,
  CASE WHEN (t.task_type_id IS NULL AND t.status = 'done') OR EXISTS (
    SELECT 1 FROM task_statuses s
    WHERE s.task_type_id = t.task_type_id AND s.name = t.status
      AND s.position = (SELECT MAX(s2.position) FROM task_statuses s2 WHERE s2.task_type_id = t.task_type_id)
  ) THEN 1 ELSE 0 END,
  'system', NULL, NULL, NULL, t.created_at
FROM tasks t
WHERE t.deleted_at IS NULL;
--> statement-breakpoint
INSERT IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  CONCAT('act-tn-', n.id), n.task_id, t.project_id,
  CASE n.note_type WHEN 'handoff' THEN 'handoff' ELSE 'note' END,
  NULL, NULL, 0, 0, 'agent', n.agent_id, NULL, NULL, n.created_at
FROM task_notes n
JOIN tasks t ON t.id = n.task_id
WHERE t.deleted_at IS NULL;
--> statement-breakpoint
INSERT IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  CONCAT('act-c-', c.id), c.entity_id, t.project_id, 'comment',
  NULL, NULL, 0, 0,
  CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'agent' END,
  COALESCE(c.user_id, c.agent_id), NULL, NULL, c.created_at
FROM comments c
JOIN tasks t ON t.id = c.entity_id
WHERE c.entity_type = 'task' AND t.deleted_at IS NULL;
