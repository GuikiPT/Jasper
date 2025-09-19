-- CreateTable
CREATE TABLE `Topic` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`guildId` VARCHAR(191) NOT NULL,
	`value` TEXT NOT NULL,
	`createdAt` DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME (3) NOT NULL,
	INDEX `Topic_guildId_idx` (`guildId`),
	UNIQUE INDEX `Topic_guildId_value_key` (`guildId`, `value`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Topic` ADD CONSTRAINT `Topic_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;