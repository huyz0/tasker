-- Custom SQL migration file, put your code below! --

-- M19-T03. See the SQLite counterpart (0039_task_statuses_reviewers_unique.sql)
-- for the race this closes.
CREATE UNIQUE INDEX `task_statuses_task_type_id_name_idx` ON `task_statuses` (`task_type_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_reviewers_task_id_user_id_idx` ON `task_reviewers` (`task_id`,`user_id`);
