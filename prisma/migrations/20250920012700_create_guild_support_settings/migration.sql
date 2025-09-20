-- CreateTable
CREATE TABLE `GuildSupportSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `supportForumChannelId` VARCHAR(191) NULL,
    `resolvedTagId` VARCHAR(191) NULL,

    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildSupportSettings` ADD CONSTRAINT `GuildSupportSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;