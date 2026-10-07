CREATE TABLE `coin_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`delta` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coin_ledger_payment_id_unique` ON `coin_ledger` (`payment_id`);--> statement-breakpoint
CREATE TABLE `coin_wallets` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`order_id` text,
	`amount_fen` integer NOT NULL,
	`coins` integer,
	`status` text NOT NULL,
	`transaction_ref` text,
	`staff_note` text,
	`created_at` text NOT NULL,
	`submitted_at` text,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_requests_transaction_ref_unique` ON `payment_requests` (`transaction_ref`);