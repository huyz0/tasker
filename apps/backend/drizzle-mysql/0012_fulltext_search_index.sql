-- Full-text search for the clustered dialect, matching the SQLite FTS5 index
-- added in `drizzle-sqlite/0025_fts5_search_index.sql` (M07-T05/T06).
--
-- Search was `LIKE '%term%'` on `title`/`description`. A leading wildcard
-- cannot use an index, so every search was a full scan of both tables, and it
-- matched substrings rather than words — "cat" matched "concatenate".
--
-- Unlike SQLite, InnoDB `FULLTEXT` needs no trigger to stay current: the index
-- is part of the table, so MySQL maintains it inside the same transaction as
-- the write by definition. The SQLite side needed six triggers to get the
-- guarantee this dialect gets for free.
--
-- The indexed columns deliberately mirror the SQLite side — `title`/`name` and
-- `description`, never `content`. Artifact bodies are base64 blobs whose
-- indexed form would be a large index of unsearchable noise (ADR-0010).

CREATE FULLTEXT INDEX `tasks_fts_idx` ON `tasks` (`title`, `description`);--> statement-breakpoint

CREATE FULLTEXT INDEX `artifacts_fts_idx` ON `artifacts` (`name`, `description`);
