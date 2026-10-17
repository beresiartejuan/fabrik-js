CREATE TABLE `auth_credentials` (
	`worker_id` text PRIMARY KEY,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY,
	`worker_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_worker_id_idx` ON `refresh_tokens` (`worker_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_token_hash_idx` ON `refresh_tokens` (`token_hash`);