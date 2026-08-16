-- M07-T09: indexes reviewed against the hot query set.
--
-- Two queries were genuine full table scans, and the rest sorted every matched
-- row to return a page of fifty.
--
-- 1. `remote_pull_requests` by `task_id` — `SCAN remote_pull_requests`. There
--    was no index on `task_id` at all, and it is how both the task detail view
--    and the dashboard's "done, but the PR is open" panel find a task's pull
--    requests.
-- 2. `entity_labels` by `label_id` — `SCAN entity_labels USING COVERING INDEX`.
--    The existing unique index is (entity_id, entity_type, label_id), so a
--    lookup by label alone cannot seek into it and walks the whole index.
--
-- The composites below are the second half: every ordered list read
--    SEARCH … USING INDEX (fk=?) | USE TEMP B-TREE FOR ORDER BY
-- which means the filter used an index and the *sort* did not — so a project
-- with 50,000 tasks sorted 50,000 rows to return 50. Adding the cursor's sort
-- columns to the index removes the temp b-tree entirely, measured per index.
--
-- These are SQLite-only. The same composites were measured on MySQL 8.0.46 at
-- 20,000 rows and the optimiser kept its filesort even when the index was
-- forced, so adding them there would be write cost for a benefit that does not
-- materialise. See the M07-T09 journal entry for the plans.

CREATE INDEX `remote_pull_requests_task_id_idx` ON `remote_pull_requests` (`task_id`);--> statement-breakpoint

CREATE INDEX `entity_labels_label_id_idx` ON `entity_labels` (`label_id`);--> statement-breakpoint

-- Serves the unfaceted task list. `status` is deliberately absent: it sits
-- between the filter and the sort columns, so one index cannot serve both this
-- and the per-column board query below.
CREATE INDEX `tasks_project_created_idx` ON `tasks` (`project_id`, `created_at`, `id`);--> statement-breakpoint

-- Serves a Kanban column, which is the hot path since M07-T03 gave each column
-- its own pagination.
CREATE INDEX `tasks_project_status_created_idx` ON `tasks` (`project_id`, `status`, `created_at`, `id`);--> statement-breakpoint

CREATE INDEX `artifacts_folder_created_idx` ON `artifacts` (`folder_id`, `created_at`, `id`);--> statement-breakpoint

CREATE INDEX `projects_org_created_idx` ON `projects` (`org_id`, `created_at`, `id`);--> statement-breakpoint

CREATE INDEX `agents_org_created_idx` ON `agents` (`org_id`, `created_at`, `id`);--> statement-breakpoint

CREATE INDEX `comments_entity_created_idx` ON `comments` (`entity_id`, `entity_type`, `created_at`, `id`);
