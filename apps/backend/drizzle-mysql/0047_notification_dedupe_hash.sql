-- Full-key deduplication without an oversized utf8mb4 index. Preserves the
-- 512-character source key; a prefix-only unique index would reject distinct
-- long keys. Existing installations and fresh bootstrap use the same upgrade.
ALTER TABLE `notifications` ADD `dedupe_hash` binary(32) GENERATED ALWAYS AS (UNHEX(SHA2(`dedupe_key`, 256))) STORED;
--> statement-breakpoint
ALTER TABLE `notifications` DROP INDEX `notifications_user_id_type_dedupe_key_idx`, ADD UNIQUE INDEX `notifications_user_id_type_dedupe_key_idx` (`user_id`, `type`, `dedupe_hash`);
