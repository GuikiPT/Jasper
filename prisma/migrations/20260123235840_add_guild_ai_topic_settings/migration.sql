-- AlterTable
ALTER TABLE `GuildSupportSettings` ADD COLUMN `waitingForUpdateTagId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `GuildAITopicSettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `userPrompt` VARCHAR(255) NULL,
    `approved` BOOLEAN NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GuildAITopicSettings_guildId_idx`(`guildId`),
    INDEX `GuildAITopicSettings_approved_idx`(`approved`),
    INDEX `GuildAITopicSettings_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommandBlacklist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `commandName` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `blacklistedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommandBlacklist_guildId_idx`(`guildId`),
    INDEX `CommandBlacklist_userId_idx`(`userId`),
    UNIQUE INDEX `CommandBlacklist_guildId_userId_commandName_key`(`guildId`, `userId`, `commandName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildAITopicSettings` ADD CONSTRAINT `GuildAITopicSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
