-- Custom SQL migration file, put your code below! --

-- M18-T03. See the SQLite counterpart (0038_artifacts_unique_names.sql) for
-- the unique-index half.
CREATE UNIQUE INDEX `folders_project_id_parent_id_name_idx` ON `folders` (`project_id`,`parent_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `artifacts_folder_id_name_idx` ON `artifacts` (`folder_id`,`name`);--> statement-breakpoint

-- mediumtext's 16,777,215-byte cap is a byte count, but the Zod schema caps
-- `content` at 15,000,000 characters - fine for base64 image uploads (pure
-- ASCII) but not guaranteed for large multi-byte UTF-8 text, which can need
-- up to 4x that in bytes. longtext removes the ceiling instead of shrinking
-- the char cap and taking away headroom the image-upload path actually uses.
ALTER TABLE `artifacts` MODIFY COLUMN `content` longtext;
