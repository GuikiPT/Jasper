-- CreateTable
CREATE TABLE `GuildYouTubeSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `youtubeChannelUrl` VARCHAR(191) NULL,
    `discordChannelId` VARCHAR(191) NULL,
    `lastSubCount` VARCHAR(191) NULL,
    `updateIntervalMinutes` INTEGER NOT NULL DEFAULT 30,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildYouTubeSettings` ADD CONSTRAINT `GuildYouTubeSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
