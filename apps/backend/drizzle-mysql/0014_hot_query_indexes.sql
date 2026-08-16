-- M07-T09, clustered half: the two genuine full table scans.
--
-- `remote_pull_requests` had no index on `task_id` despite it being how the
-- task detail view and the dashboard's "done, but the PR is open" panel find a
-- task's pull requests. `entity_labels` is indexed (entity_id, entity_type,
-- label_id), so a lookup by label alone cannot seek and walks the whole index.
--
-- The sort-backing composites in `drizzle-sqlite/0027_hot_query_indexes.sql`
-- are deliberately **not** mirrored here. Measured on MySQL 8.0.46 with 20,000
-- tasks in one project, the optimiser kept `Using filesort` for
--   ... WHERE project_id=? AND status=? AND deleted_at IS NULL
--       ORDER BY created_at DESC, id DESC LIMIT 50
-- with (project_id, status, created_at), with (project_id, status, deleted_at,
-- created_at), and even under FORCE INDEX. An index that does not change the
-- plan is write amplification with no read benefit, so it is not added. MySQL
-- also caps a key at 3072 bytes, which the four-column form exceeds outright
-- for these varchar(256) columns — the first attempt failed with error 1071.
--
-- Filesort here is not a full table scan: the verify line holds, and MySQL
-- evaluates `ORDER BY … LIMIT 50` with a bounded priority queue rather than a
-- full sort. Revisit if measurement at the real scale target says otherwise.

CREATE INDEX `remote_pull_requests_task_id_idx` ON `remote_pull_requests` (`task_id`);--> statement-breakpoint

CREATE INDEX `entity_labels_label_id_idx` ON `entity_labels` (`label_id`);
