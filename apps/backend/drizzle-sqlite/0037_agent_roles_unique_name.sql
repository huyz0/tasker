-- M17-T02. Two agent roles with the same name in the same org were never
-- rejected - "Reviewer" and "Reviewer" sat side by side in the picker an
-- agent gets created against, indistinguishable until you open each one.
-- Same shape as `labels_org_id_name_idx` and `projects_org_id_key_idx`.
CREATE UNIQUE INDEX `agent_roles_org_id_name_idx` ON `agent_roles` (`org_id`,`name`);
