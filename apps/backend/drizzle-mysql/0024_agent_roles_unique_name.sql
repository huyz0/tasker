-- Custom SQL migration file, put your code below! --

-- M17-T02. See the SQLite counterpart (0037_agent_roles_unique_name.sql).
CREATE UNIQUE INDEX `agent_roles_org_id_name_idx` ON `agent_roles` (`org_id`,`name`);
