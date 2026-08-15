CREATE TABLE `api_tokens` (
	`id` varchar(256) NOT NULL,
	`org_id` varchar(256) NOT NULL,
	`agent_id` varchar(256) NOT NULL,
	`name` varchar(256) NOT NULL,
	`token_prefix` varchar(32) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`scopes` mediumtext NOT NULL,
	`created_by` varchar(256) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`last_used_at` timestamp,
	`revoked_at` timestamp,
	CONSTRAINT `api_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_tokens_token_hash_idx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `api_tokens` ADD CONSTRAINT `api_tokens_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `api_tokens_agent_id_idx` ON `api_tokens` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `api_tokens_org_id_idx` ON `api_tokens` (`org_id`);
