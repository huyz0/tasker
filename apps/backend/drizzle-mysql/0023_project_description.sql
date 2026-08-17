-- Custom SQL migration file, put your code below! --

-- M16-T01. See the SQLite counterpart (0036_project_description.sql).
-- varchar(1024), matching project_templates.description exactly.
ALTER TABLE `projects` ADD COLUMN `description` varchar(1024);
