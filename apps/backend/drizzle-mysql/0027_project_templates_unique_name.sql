-- Custom SQL migration file, put your code below! --

-- M20-T04. See the SQLite counterpart (0040_project_templates_unique_name.sql)
-- for the race this closes.
CREATE UNIQUE INDEX `project_templates_org_id_name_idx` ON `project_templates` (`org_id`,`name`);
