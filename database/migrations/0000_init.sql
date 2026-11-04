CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`preset` text NOT NULL,
	`base_url` text NOT NULL,
	`chat_model` text,
	`transcription_model` text,
	`supports_transcription` integer DEFAULT false NOT NULL,
	`supports_chat` integer DEFAULT true NOT NULL,
	`last_test_at` integer,
	`last_test_ok` integer,
	`last_test_message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_history` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `dictations` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`language` text,
	`language_source` text,
	`speech_provider` text NOT NULL,
	`speech_model` text,
	`mode` text NOT NULL,
	`original_text` text DEFAULT '' NOT NULL,
	`corrected_text` text,
	`final_text` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`target` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`audio_path` text,
	`document_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_dictations_started` ON `dictations` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_dictations_language` ON `dictations` (`language`);--> statement-breakpoint
CREATE TABLE `document_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_folders_parent` ON `document_folders` (`parent_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`content_json` text NOT NULL,
	`content_text` text NOT NULL,
	`word_count` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_versions_doc_created` ON `document_versions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`folder_id` text,
	`content_json` text NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`template_id` text,
	`deleted_at` integer,
	`last_snapshot_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_opened_at` integer,
	FOREIGN KEY (`folder_id`) REFERENCES `document_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_documents_updated` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_documents_folder` ON `documents` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_deleted` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_documents_favorite` ON `documents` (`is_favorite`);--> statement-breakpoint
CREATE TABLE `personal_dictionary` (
	`id` text PRIMARY KEY NOT NULL,
	`original` text NOT NULL,
	`preferred` text NOT NULL,
	`language` text,
	`alias` text,
	`category` text DEFAULT 'term' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dictionary_language` ON `personal_dictionary` (`language`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `speech_models` (
	`id` text PRIMARY KEY NOT NULL,
	`engine` text NOT NULL,
	`file_name` text NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`verified` integer DEFAULT false NOT NULL,
	`installed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_speech_models_file` ON `speech_models` (`engine`,`file_name`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`content_json` text NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
