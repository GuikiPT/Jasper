-- CreateTable
CREATE TABLE `SupportTag` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`guildId` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`authorId` VARCHAR(191) NOT NULL,
	`editedBy` VARCHAR(191) NULL,
	`embedTitle` TEXT NOT NULL,
	`embedDescription` TEXT NULL,
	`embedFooter` TEXT NULL,
	`embedImageUrl` TEXT NULL,
	`createdAt` DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME (3) NOT NULL,
	INDEX `SupportTag_guildId_idx` (`guildId`),
	UNIQUE INDEX `SupportTag_guildId_name_key` (`guildId`, `name`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Topic` MODIFY `updatedAt` DATETIME (3) NOT NULL;

-- AddForeignKey
ALTER TABLE `SupportTag` ADD CONSTRAINT `SupportTag_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;