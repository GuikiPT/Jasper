-- CreateTable
CREATE TABLE `GuildSlowmodeSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `messageThreshold` INTEGER NOT NULL DEFAULT 10,
    `messageTimeWindow` INTEGER NOT NULL DEFAULT 30,
    `cooldownDuration` INTEGER NOT NULL DEFAULT 20,
    `resetTime` INTEGER NOT NULL DEFAULT 300,
    `maxSlowmode` INTEGER NOT NULL DEFAULT 21600,

    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildSlowmodeSettings` ADD CONSTRAINT `GuildSlowmodeSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;