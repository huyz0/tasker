-- M20-T04. Two identically-named project templates in one org were never
-- rejected. Same class as M17-T02's agent_roles, M18-T03's folders/
-- artifacts, and M19-T03's task_statuses/task_reviewers unique constraints.
CREATE UNIQUE INDEX `project_templates_org_id_name_idx` ON `project_templates` (`org_id`,`name`);
