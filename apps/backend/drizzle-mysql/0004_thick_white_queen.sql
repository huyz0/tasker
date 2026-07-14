CREATE TABLE `revoked_sessions` (
	`jti` varchar(256) NOT NULL,
	`user_id` varchar(256) NOT NULL,
	`revoked_at` timestamp NOT NULL,
	CONSTRAINT `revoked_sessions_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
ALTER TABLE `revoked_sessions` ADD CONSTRAINT `revoked_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;