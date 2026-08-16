-- Extends full-text search to projects, agents and comments (M07-T08),
-- following the pattern established for tasks and artifacts in
-- `0025_fts5_search_index.sql`: contentless FTS5 tables kept current by
-- triggers, so the index update sits inside the same transaction as the write
-- and no handler can forget it.
--
-- Projects and agents are small tables, and a `LIKE` scan over them would have
-- been fast enough. They are indexed anyway so that search *behaves* the same
-- whatever it finds: with a mixed implementation, "cat" would match
-- "concatenate" for a project and not for a task, which is a worse defect than
-- a slow query because it is invisible.
--
-- Comments carry no `deleted_at`; they are scoped through the entity they hang
-- off, which is why the handler joins rather than filtering here.

CREATE VIRTUAL TABLE `projects_fts` USING fts5(
  name,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

CREATE VIRTUAL TABLE `agents_fts` USING fts5(
  name,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

CREATE VIRTUAL TABLE `comments_fts` USING fts5(
  content,
  content='',
  tokenize='unicode61'
);--> statement-breakpoint

INSERT INTO `projects_fts`(rowid, name)
  SELECT rowid, coalesce(name, '') FROM `projects`;--> statement-breakpoint

INSERT INTO `agents_fts`(rowid, name)
  SELECT rowid, coalesce(name, '') FROM `agents`;--> statement-breakpoint

INSERT INTO `comments_fts`(rowid, content)
  SELECT rowid, coalesce(content, '') FROM `comments`;--> statement-breakpoint

CREATE TRIGGER `projects_fts_insert` AFTER INSERT ON `projects` BEGIN
  INSERT INTO `projects_fts`(rowid, name) VALUES (new.rowid, coalesce(new.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `projects_fts_delete` AFTER DELETE ON `projects` BEGIN
  INSERT INTO `projects_fts`(`projects_fts`, rowid, name)
    VALUES ('delete', old.rowid, coalesce(old.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `projects_fts_update` AFTER UPDATE ON `projects` BEGIN
  INSERT INTO `projects_fts`(`projects_fts`, rowid, name)
    VALUES ('delete', old.rowid, coalesce(old.name, ''));
  INSERT INTO `projects_fts`(rowid, name) VALUES (new.rowid, coalesce(new.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `agents_fts_insert` AFTER INSERT ON `agents` BEGIN
  INSERT INTO `agents_fts`(rowid, name) VALUES (new.rowid, coalesce(new.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `agents_fts_delete` AFTER DELETE ON `agents` BEGIN
  INSERT INTO `agents_fts`(`agents_fts`, rowid, name)
    VALUES ('delete', old.rowid, coalesce(old.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `agents_fts_update` AFTER UPDATE ON `agents` BEGIN
  INSERT INTO `agents_fts`(`agents_fts`, rowid, name)
    VALUES ('delete', old.rowid, coalesce(old.name, ''));
  INSERT INTO `agents_fts`(rowid, name) VALUES (new.rowid, coalesce(new.name, ''));
END;--> statement-breakpoint

CREATE TRIGGER `comments_fts_insert` AFTER INSERT ON `comments` BEGIN
  INSERT INTO `comments_fts`(rowid, content) VALUES (new.rowid, coalesce(new.content, ''));
END;--> statement-breakpoint

CREATE TRIGGER `comments_fts_delete` AFTER DELETE ON `comments` BEGIN
  INSERT INTO `comments_fts`(`comments_fts`, rowid, content)
    VALUES ('delete', old.rowid, coalesce(old.content, ''));
END;--> statement-breakpoint

CREATE TRIGGER `comments_fts_update` AFTER UPDATE ON `comments` BEGIN
  INSERT INTO `comments_fts`(`comments_fts`, rowid, content)
    VALUES ('delete', old.rowid, coalesce(old.content, ''));
  INSERT INTO `comments_fts`(rowid, content) VALUES (new.rowid, coalesce(new.content, ''));
END;
