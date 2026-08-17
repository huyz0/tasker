-- M16-T01. No description field existed anywhere on a project - unlike its
-- template, which always had one. Nullable, same as `deletedAt`: existing
-- rows just have no description until someone writes one.
ALTER TABLE `projects` ADD COLUMN `description` text;
