-- M19-T03. createTaskStatus and addTaskReviewer both select-then-insert to
-- reject a duplicate (task_type_id, name) or (task_id, user_id) up front,
-- but that check has a race window: two concurrent calls can both pass it
-- before either commits. These indexes close it at the DB level, same
-- pattern as M18-T03's folder/artifact name uniqueness.
CREATE UNIQUE INDEX `task_statuses_task_type_id_name_idx` ON `task_statuses` (`task_type_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_reviewers_task_id_user_id_idx` ON `task_reviewers` (`task_id`,`user_id`);
