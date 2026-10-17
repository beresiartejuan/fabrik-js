CREATE TABLE `assignments` (
	`id` text PRIMARY KEY,
	`worker_id` text NOT NULL,
	`machine_id` text NOT NULL,
	`days_of_week` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batch_event_inputs` (
	`event_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`batch_id` text,
	`material_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	CONSTRAINT `batch_event_inputs_pk` PRIMARY KEY(`event_id`, `ordinal`)
);
--> statement-breakpoint
CREATE TABLE `batch_event_outputs` (
	`event_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`batch_id` text,
	`material_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	CONSTRAINT `batch_event_outputs_pk` PRIMARY KEY(`event_id`, `ordinal`)
);
--> statement-breakpoint
CREATE TABLE `batch_events` (
	`id` text PRIMARY KEY,
	`machine_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`location_id` text NOT NULL,
	`recipe_step_id` text,
	`observation` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY,
	`material_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`recipe_id` text,
	`origin_batch_event_id` text,
	`status` text DEFAULT 'in_progress' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `factories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`location_id` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`kind` text NOT NULL,
	`physical_state` text NOT NULL,
	`unit_of_measure` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_step_inputs` (
	`recipe_step_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`material_id` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	CONSTRAINT `recipe_step_inputs_pk` PRIMARY KEY(`recipe_step_id`, `ordinal`)
);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`machine_type` text NOT NULL,
	`output_product_id` text NOT NULL,
	`output_amount` real NOT NULL,
	`output_unit` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`output_product_id` text NOT NULL,
	`output_amount` real NOT NULL,
	`output_unit` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY,
	`location_id` text NOT NULL,
	`material_id` text NOT NULL,
	`delta_amount` real NOT NULL,
	`delta_unit` text NOT NULL,
	`reason` text NOT NULL,
	`batch_event_id` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assignments_worker_id_idx` ON `assignments` (`worker_id`);--> statement-breakpoint
CREATE INDEX `assignments_machine_id_idx` ON `assignments` (`machine_id`);--> statement-breakpoint
CREATE INDEX `batch_event_inputs_batch_id_idx` ON `batch_event_inputs` (`batch_id`);--> statement-breakpoint
CREATE INDEX `batch_event_inputs_material_id_idx` ON `batch_event_inputs` (`material_id`);--> statement-breakpoint
CREATE INDEX `batch_event_outputs_batch_id_idx` ON `batch_event_outputs` (`batch_id`);--> statement-breakpoint
CREATE INDEX `batch_event_outputs_material_id_idx` ON `batch_event_outputs` (`material_id`);--> statement-breakpoint
CREATE INDEX `batch_events_machine_id_idx` ON `batch_events` (`machine_id`);--> statement-breakpoint
CREATE INDEX `batch_events_worker_id_idx` ON `batch_events` (`worker_id`);--> statement-breakpoint
CREATE INDEX `batch_events_timestamp_idx` ON `batch_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `batches_material_id_idx` ON `batches` (`material_id`);--> statement-breakpoint
CREATE INDEX `batches_status_idx` ON `batches` (`status`);--> statement-breakpoint
CREATE INDEX `batches_recipe_id_idx` ON `batches` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `batches_origin_batch_event_id_idx` ON `batches` (`origin_batch_event_id`);--> statement-breakpoint
CREATE INDEX `locations_kind_idx` ON `locations` (`kind`);--> statement-breakpoint
CREATE INDEX `machines_location_id_idx` ON `machines` (`location_id`);--> statement-breakpoint
CREATE INDEX `machines_status_idx` ON `machines` (`status`);--> statement-breakpoint
CREATE INDEX `machines_type_idx` ON `machines` (`type`);--> statement-breakpoint
CREATE INDEX `materials_kind_idx` ON `materials` (`kind`);--> statement-breakpoint
CREATE INDEX `materials_physical_state_idx` ON `materials` (`physical_state`);--> statement-breakpoint
CREATE INDEX `recipe_step_inputs_material_id_idx` ON `recipe_step_inputs` (`material_id`);--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_id_idx` ON `recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipes_output_product_id_idx` ON `recipes` (`output_product_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_location_id_idx` ON `stock_movements` (`location_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_material_id_idx` ON `stock_movements` (`material_id`);--> statement-breakpoint
CREATE INDEX `workers_role_idx` ON `workers` (`role`);--> statement-breakpoint
CREATE INDEX `workers_active_idx` ON `workers` (`active`);