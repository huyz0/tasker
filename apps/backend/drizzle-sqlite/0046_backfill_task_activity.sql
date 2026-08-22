-- Custom SQL migration file, put your code below! --

-- M24-T03 (ADR-0020): truthful task_activity backfill. Three sources, no
-- invented history. Ids are deterministic ('act-' / 'act-tn-' / 'act-c-' +
-- the source row's primary key), so INSERT OR IGNORE makes every statement
-- idempotent — re-running the file inserts nothing.
--
-- 1. One 'created' row per non-archived task, carrying its CURRENT status as
--    the honest "as of collection start" baseline (backfilling the initial
--    default would show every pre-existing done task as todo forever).
--    Soft-deleted tasks are excluded: a 'created' with no 'archived' pair
--    would sit in the CFD stack forever. Terminality is stamped from current
--    config: the status shares the type's max position (ties are terminal),
--    or 'done' for untyped tasks. Assignees are NULL — holder-at-creation is
--    unknown and never invented.
INSERT OR IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  'act-' || t.id, t.id, t.project_id, 'created', NULL, t.status, 0,
  CASE WHEN (t.task_type_id IS NULL AND t.status = 'done') OR EXISTS (
    SELECT 1 FROM task_statuses s
    WHERE s.task_type_id = t.task_type_id AND s.name = t.status
      AND s.position = (SELECT MAX(s2.position) FROM task_statuses s2 WHERE s2.task_type_id = t.task_type_id)
  ) THEN 1 ELSE 0 END,
  'system', NULL, NULL, NULL, t.created_at
FROM tasks t
WHERE t.deleted_at IS NULL;
--> statement-breakpoint
-- 2. The existing note/handoff history, at its real timestamps, so the
--    stalled-work and churn panels are truthful on day one rather than
--    degraded to created_at. Notes are agent-authored by construction.
INSERT OR IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  'act-tn-' || n.id, n.task_id, t.project_id,
  CASE n.note_type WHEN 'handoff' THEN 'handoff' ELSE 'note' END,
  NULL, NULL, 0, 0, 'agent', n.agent_id, NULL, NULL, n.created_at
FROM task_notes n
JOIN tasks t ON t.id = n.task_id
WHERE t.deleted_at IS NULL;
--> statement-breakpoint
-- 3. Task-scoped comments. A comment with neither author id (purged agent)
--    keeps actor_type 'agent' with a NULL actor_id — the audit_log
--    convention: the type says what it was, null never means "unrecorded".
INSERT OR IGNORE INTO task_activity
  (id, task_id, project_id, kind, from_status, to_status, from_is_terminal, to_is_terminal,
   actor_type, actor_id, assignee_agent_id, assignee_user_id, occurred_at)
SELECT
  'act-c-' || c.id, c.entity_id, t.project_id, 'comment',
  NULL, NULL, 0, 0,
  CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'agent' END,
  COALESCE(c.user_id, c.agent_id), NULL, NULL, c.created_at
FROM comments c
JOIN tasks t ON t.id = c.entity_id
WHERE c.entity_type = 'task' AND t.deleted_at IS NULL;
