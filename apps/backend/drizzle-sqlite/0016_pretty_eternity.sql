CREATE TABLE `revoked_sessions` (
	`jti` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`revoked_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
