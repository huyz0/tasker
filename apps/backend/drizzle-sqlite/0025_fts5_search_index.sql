-- Full-text search for tasks and artifacts.
--
-- Search was `LIKE '%term%'` on `title`/`description`. A leading wildcard
-- cannot use an index, so every search was a full scan of both tables, and it
-- matched substrings rather than words — "cat" matched "concatenate".
--
-- The index is maintained by **triggers**, not by the application. M07's risk
-- note asks for the index update to sit inside the same transaction as the
-- write so it cannot drift; a trigger is that guarantee expressed where it
-- cannot be forgotten by the next handler to insert a row. An application-side
-- update would have to be repeated at every write site, and the one that
-- forgets is invisible until someone reports a missing search result.
--
-- `content=''` makes these contentless FTS5 tables: they store the index, not
-- a second copy of the rows, so an artifact body is not duplicated on disk.
-- Contentless tables cannot be updated in place, hence delete-then-insert in
-- the update triggers.

CREATE VIRTUAL TABLE `tasks_fts` USING fts5(
  title,
  description,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

CREATE VIRTUAL TABLE `artifacts_fts` USING fts5(
  name,
  description,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

-- Backfill. `rowid` is the join back to the base table, which is what lets a
-- contentless index return the row it matched.
INSERT INTO `tasks_fts`(rowid, title, description)
  SELECT rowid, coalesce(title, ''), coalesce(description, '') FROM `tasks`;--> statement-breakpoint

INSERT INTO `artifacts_fts`(rowid, name, description)
  SELECT rowid, coalesce(name, ''), coalesce(description, '') FROM `artifacts`;--> statement-breakpoint

CREATE TRIGGER `tasks_fts_insert` AFTER INSERT ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(rowid, title, description)
    VALUES (new.rowid, coalesce(new.title, ''), coalesce(new.description, ''));
END;--> statement-breakpoint

CREATE TRIGGER `tasks_fts_delete` AFTER DELETE ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(`tasks_fts`, rowid, title, description)
    VALUES ('delete', old.rowid, coalesce(old.title, ''), coalesce(old.description, ''));
END;--> statement-breakpoint

CREATE TRIGGER `tasks_fts_update` AFTER UPDATE ON `tasks` BEGIN
  INSERT INTO `tasks_fts`(`tasks_fts`, rowid, title, description)
    VALUES ('delete', old.rowid, coalesce(old.title, ''), coalesce(old.description, ''));
  INSERT INTO `tasks_fts`(rowid, title, description)
    VALUES (new.rowid, coalesce(new.title, ''), coalesce(new.description, ''));
END;--> statement-breakpoint

CREATE TRIGGER `artifacts_fts_insert` AFTER INSERT ON `artifacts` BEGIN
  INSERT INTO `artifacts_fts`(rowid, name, description)
    VALUES (new.rowid, coalesce(new.name, ''), coalesce(new.description, ''));
END;--> statement-breakpoint

CREATE TRIGGER `artifacts_fts_delete` AFTER DELETE ON `artifacts` BEGIN
  INSERT INTO `artifacts_fts`(`artifacts_fts`, rowid, name, description)
    VALUES ('delete', old.rowid, coalesce(old.name, ''), coalesce(old.description, ''));
END;--> statement-breakpoint

CREATE TRIGGER `artifacts_fts_update` AFTER UPDATE ON `artifacts` BEGIN
  INSERT INTO `artifacts_fts`(`artifacts_fts`, rowid, name, description)
    VALUES ('delete', old.rowid, coalesce(old.name, ''), coalesce(old.description, ''));
  INSERT INTO `artifacts_fts`(rowid, name, description)
    VALUES (new.rowid, coalesce(new.name, ''), coalesce(new.description, ''));
END;
