-- M30-T09: an idempotency key is bound to the request it was first used
-- with (a reuse with different arguments is refused rather than replaying an
-- unrelated response), and keys expire. Nullable: rows stored before this
-- carry no hash and keep replaying as they always did until they expire.
ALTER TABLE `idempotency_keys` ADD `request_hash` text;--> statement-breakpoint
CREATE INDEX `idempotency_keys_created_at_idx` ON `idempotency_keys` (`created_at`);
