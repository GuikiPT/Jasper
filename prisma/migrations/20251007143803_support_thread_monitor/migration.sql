-- AlterTable
ALTER TABLE `GuildSupportSettings` ADD COLUMN `autoCloseHours` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `inactivityReminderHours` INTEGER NOT NULL DEFAULT 48;

-- CreateTable
CREATE TABLE `SupportThread` (
    `threadId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastAuthorMessageAt` DATETIME(3) NOT NULL,
    `lastReminderAt` DATETIME(3) NULL,
    `reminderMessageId` VARCHAR(191) NULL,
    `reminderCount` INTEGER NOT NULL DEFAULT 0,
    `closedAt` DATETIME(3) NULL,

    INDEX `SupportThread_guildId_idx`(`guildId`),
    INDEX `SupportThread_lastAuthorMessageAt_idx`(`lastAuthorMessageAt`),
    INDEX `SupportThread_closedAt_idx`(`closedAt`),
    PRIMARY KEY (`threadId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
