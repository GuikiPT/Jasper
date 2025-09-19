-- CreateTable
CREATE TABLE `GuildChannelSettings` (
	`guildId` VARCHAR(191) NOT NULL,
	`allowedSkullboardChannels` JSON NOT NULL,
	`allowedSnipeChannels` JSON NOT NULL,
	`allowedTagChannels` JSON NOT NULL,
	`automaticSlowmodeChannels` JSON NOT NULL,
	PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildChannelSettings` ADD CONSTRAINT `GuildChannelSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;