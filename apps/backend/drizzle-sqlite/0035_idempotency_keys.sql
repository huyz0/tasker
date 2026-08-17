-- M14-T07. Retry-safety for mutating RPCs (createTask, claimTask): a
-- caller-supplied key, scoped to (principal, method, key) so the same key
-- string from two different callers, or reused across two different RPCs,
-- can never collide. No FK to a principal - `principal_key` holds
-- "user:<id>" or "agent:<id>", which a single references() cannot express.
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`principal_key` text NOT NULL,
	`method` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_keys_principal_method_key_idx` ON `idempotency_keys` (`principal_key`,`method`,`idempotency_key`);
