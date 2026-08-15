-- Custom SQL migration file, put your code below! --

-- ADR-0007. See the SQLite counterpart (0021_scope_agent_roles_to_org.sql) for
-- the full note: this ABORTS if a role is shared across organizations, and
-- DELETES roles no agent references.

CREATE TABLE `_abort_agent_role_is_shared_across_orgs` (`ok` INT NOT NULL CHECK (`ok` = 1));
--> statement-breakpoint
INSERT INTO `_abort_agent_role_is_shared_across_orgs` (`ok`)
SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
FROM (
  SELECT `agent_role_id`
  FROM (SELECT DISTINCT `agent_role_id`, `org_id` FROM `agents`) d
  GROUP BY `agent_role_id`
  HAVING COUNT(*) > 1
) shared;
--> statement-breakpoint
DROP TABLE `_abort_agent_role_is_shared_across_orgs`;
--> statement-breakpoint

DELETE FROM `agent_roles` WHERE `id` NOT IN (SELECT `agent_role_id` FROM `agents`);
--> statement-breakpoint

ALTER TABLE `agent_roles` ADD COLUMN `org_id` varchar(256);
--> statement-breakpoint
UPDATE `agent_roles` r
SET r.`org_id` = (SELECT a.`org_id` FROM `agents` a WHERE a.`agent_role_id` = r.`id` LIMIT 1);
--> statement-breakpoint
ALTER TABLE `agent_roles` MODIFY COLUMN `org_id` varchar(256) NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_roles` ADD CONSTRAINT `agent_roles_org_id_organizations_id_fk`
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`);
