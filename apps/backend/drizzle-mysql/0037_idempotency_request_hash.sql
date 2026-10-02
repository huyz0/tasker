-- M30-T09: see drizzle-sqlite/0050_idempotency_request_hash.sql.
ALTER TABLE `idempotency_keys` ADD `request_hash` varchar(64);--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_at_idx` ON `idempotency_keys` (`created_at`);
