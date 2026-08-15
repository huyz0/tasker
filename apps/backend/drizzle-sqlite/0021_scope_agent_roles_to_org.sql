-- Custom SQL migration file, put your code below! --

-- ADR-0007: agent_roles was a global catalogue shared by every tenant, so an
-- admin of any organization could rewrite a persona another organization's
-- agents run on. It gains a NOT NULL org_id.
--
-- Two things this migration does that an operator must know before running it:
--
--   * It ABORTS if any role is referenced by agents in more than one
--     organization. The data does not say who owns such a role, and picking
--     one would silently hand another tenant's persona away. Resolve those by
--     duplicating the role per organization and repointing the agents, then
--     re-run.
--   * It DELETES roles referenced by no agent at all. Nothing points at them
--     and no organization can claim them. This is not reversible in place.
--
-- EVERY STATEMENT BELOW SITS IN ITS OWN CHUNK, AND THAT IS LOAD-BEARING.
-- (Never write the breakpoint marker itself inside a comment: drizzle splits
-- the file on that exact string, so a comment mentioning it splits the file
-- there too and leaves a comment-only chunk that fails as invalid SQL.)
-- bun:sqlite silently discards errors from any statement
-- after the first in a single run() call: `CREATE TABLE g(...CHECK...);
-- INSERT INTO g VALUES(0);` completes without throwing and leaves g empty.
-- Drizzle runs one chunk per run(), so a guard sharing a chunk with anything
-- before it is decorative. Do not merge these.

-- Guard. The CHECK fails when any role spans organizations, and the table name
-- is the error message an operator will see.
CREATE TABLE `_abort_agent_role_is_shared_across_orgs` (`ok` INTEGER NOT NULL CHECK (`ok` = 1));
--> statement-breakpoint

INSERT INTO `_abort_agent_role_is_shared_across_orgs` (`ok`)
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM (
  SELECT `agent_role_id`
  FROM (SELECT DISTINCT `agent_role_id`, `org_id` FROM `agents`)
  GROUP BY `agent_role_id`
  HAVING COUNT(*) > 1
);
--> statement-breakpoint

DROP TABLE `_abort_agent_role_is_shared_across_orgs`;
--> statement-breakpoint

DELETE FROM `agent_roles` WHERE `id` NOT IN (SELECT `agent_role_id` FROM `agents`);
--> statement-breakpoint

-- SQLite cannot add a NOT NULL column carrying a foreign key to a populated
-- table, so the table is rebuilt. Every surviving role has exactly one org by
-- the statements above, which is what makes the subselect single-valued.
CREATE TABLE `agent_roles_new` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL REFERENCES `organizations`(`id`),
  `name` text NOT NULL,
  `system_prompt` text NOT NULL,
  `capabilities` text NOT NULL,
  `created_at` integer
);
--> statement-breakpoint

INSERT INTO `agent_roles_new` (`id`, `org_id`, `name`, `system_prompt`, `capabilities`, `created_at`)
SELECT r.`id`,
       (SELECT a.`org_id` FROM `agents` a WHERE a.`agent_role_id` = r.`id` LIMIT 1),
       r.`name`, r.`system_prompt`, r.`capabilities`, r.`created_at`
FROM `agent_roles` r;
--> statement-breakpoint

DROP TABLE `agent_roles`;
--> statement-breakpoint

ALTER TABLE `agent_roles_new` RENAME TO `agent_roles`;
