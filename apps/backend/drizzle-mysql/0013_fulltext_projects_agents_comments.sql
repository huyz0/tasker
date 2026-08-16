-- The clustered half of M07-T08: the same three entity types made searchable,
-- mirroring `drizzle-sqlite/0026_fts5_projects_agents_comments.sql`.
--
-- As with `0012`, InnoDB needs no triggers — the index belongs to the table, so
-- MySQL maintains it inside the write's own transaction.
--
-- Note `innodb_ft_min_token_size` defaults to 3, so words shorter than that are
-- not indexed at all and this dialect will not find them where SQLite's
-- unicode61 tokenizer will. That divergence is asserted by a test rather than
-- papered over; changing it is a server-configuration decision.

CREATE FULLTEXT INDEX `projects_fts_idx` ON `projects` (`name`);--> statement-breakpoint

CREATE FULLTEXT INDEX `agents_fts_idx` ON `agents` (`name`);--> statement-breakpoint

CREATE FULLTEXT INDEX `comments_fts_idx` ON `comments` (`content`);
