CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `display_name` VARCHAR(80) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chat_sessions` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `chat_sessions_user_id_updated_at_idx`(`user_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `chat_messages` (
    `id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `documents` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `pages` INTEGER NOT NULL,
    `chunks_count` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `embedding_model` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `documents_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_runs` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `question` TEXT NOT NULL,
    `plan` JSON NOT NULL,
    `document_ids` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `report` LONGTEXT NULL,
    `error` TEXT NULL,
    `search_count` INTEGER NOT NULL DEFAULT 0,
    `invalid_citation_ids` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    INDEX `research_runs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `research_runs_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_run_documents` (
    `run_id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    INDEX `research_run_documents_document_id_idx`(`document_id`),
    PRIMARY KEY (`run_id`, `document_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `run_id` VARCHAR(36) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `payload` JSON NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    INDEX `research_events_run_id_timestamp_idx`(`run_id`, `timestamp`),
    UNIQUE INDEX `research_events_run_id_sequence_key`(`run_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `research_citations` (
    `id` VARCHAR(36) NOT NULL,
    `run_id` VARCHAR(36) NOT NULL,
    `citation_id` VARCHAR(100) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `page` INTEGER NULL,
    `chunk_id` VARCHAR(100) NOT NULL,
    `excerpt` LONGTEXT NOT NULL,
    `vector_score` DOUBLE NOT NULL,
    `rerank_score` DOUBLE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `research_citations_run_id_idx`(`run_id`),
    INDEX `research_citations_document_id_idx`(`document_id`),
    UNIQUE INDEX `research_citations_run_id_citation_id_key`(`run_id`, `citation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `documents` ADD CONSTRAINT `documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `research_runs` ADD CONSTRAINT `research_runs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `research_run_documents` ADD CONSTRAINT `research_run_documents_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `research_run_documents` ADD CONSTRAINT `research_run_documents_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `research_events` ADD CONSTRAINT `research_events_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `research_citations` ADD CONSTRAINT `research_citations_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
