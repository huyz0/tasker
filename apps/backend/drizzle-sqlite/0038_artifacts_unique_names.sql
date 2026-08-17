-- M18-T03. Two folders with the same name under the same parent, or two
-- artifacts with the same name in the same folder, were never rejected -
-- indistinguishable entries in any picker/tree until opened. NULL parentId
-- (root-level folders) is not fully covered: SQLite treats NULL as distinct
-- from every other value, including another NULL, in a unique index, so this
-- catches siblings under a real parent but not two root folders in the same
-- project - the application-level pre-check in createFolder covers that gap.
CREATE UNIQUE INDEX `folders_project_id_parent_id_name_idx` ON `folders` (`project_id`,`parent_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_folder_id_name_idx` ON `artifacts` (`folder_id`,`name`);
