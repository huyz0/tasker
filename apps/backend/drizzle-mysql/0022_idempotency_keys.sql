-- M14-T07. Retry-safety for mutating RPCs (createTask, claimTask): a
-- caller-supplied key, scoped to (principal, method, key) so the same key
-- string from two different callers, or reused across two different RPCs,
-- can never collide. No FK to a principal - `principal_key` holds
-- "user:<id>" or "agent:<id>", which a single reference cannot express.
CREATE TABLE `idempotency_keys` (
	`id` varchar(256) NOT NULL,
	`principal_key` varchar(256) NOT NULL,
	`method` varchar(128) NOT NULL,
	`idempotency_key` varchar(256) NOT NULL,
	`response_json` mediumtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_keys_principal_method_key_idx` UNIQUE(`principal_key`,`method`,`idempotency_key`)
);
