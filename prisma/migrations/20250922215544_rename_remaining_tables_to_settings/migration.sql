-- CreateTable
CREATE TABLE `GuildSupportTagSettings` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`guildId` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`authorId` VARCHAR(191) NOT NULL,
	`editedBy` VARCHAR(191) NULL,
	`embedTitle` VARCHAR(512) NOT NULL,
	`embedDescription` TEXT NULL,
	`embedFooter` TEXT NULL,
	`embedImageUrl` VARCHAR(1024) NULL,
	`createdAt` DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME (3) NOT NULL,
	INDEX `GuildSupportTagSettings_guildId_idx` (`guildId`),
	UNIQUE INDEX `GuildSupportTagSettings_guildId_name_key` (`guildId`, `name`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildTopicSettings` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`guildId` VARCHAR(191) NOT NULL,
	`value` VARCHAR(191) NOT NULL,
	`createdAt` DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME (3) NOT NULL,
	INDEX `GuildTopicSettings_guildId_idx` (`guildId`),
	UNIQUE INDEX `GuildTopicSettings_guildId_value_key` (`guildId`, `value`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Copy data from old tables to new tables
INSERT INTO
	GuildSupportTagSettings (
		id,
		guildId,
		name,
		authorId,
		editedBy,
		embedTitle,
		embedDescription,
		embedFooter,
		embedImageUrl,
		createdAt,
		updatedAt
	)
SELECT
	id,
	guildId,
	name,
	authorId,
	editedBy,
	embedTitle,
	embedDescription,
	embedFooter,
	embedImageUrl,
	createdAt,
	updatedAt
FROM
	GuildSupportTags;

INSERT INTO
	GuildTopicSettings (id, guildId, value, createdAt, updatedAt)
SELECT
	id,
	guildId,
	value,
	createdAt,
	updatedAt
FROM
	GuildTopics;

-- Drop old tables
DROP TABLE GuildSupportTags;

DROP TABLE GuildTopics;

-- AddForeignKey
ALTER TABLE `GuildSupportTagSettings` ADD CONSTRAINT `GuildSupportTagSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuildTopicSettings` ADD CONSTRAINT `GuildTopicSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `GuildRoleSettings` MODIFY `allowedAdminRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `allowedFunCommandRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `allowedStaffRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `allowedTagAdminRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `allowedTagRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `ignoredSnipedRoles` JSON NOT NULL;

ALTER TABLE `GuildRoleSettings` MODIFY `supportRoles` JSON NOT NULL;

-- AlterTable
ALTER TABLE `GuildChannelSettings` MODIFY `allowedSkullboardChannels` JSON NOT NULL;

ALTER TABLE `GuildChannelSettings` MODIFY `allowedSnipeChannels` JSON NOT NULL;

ALTER TABLE `GuildChannelSettings` MODIFY `allowedTagChannels` JSON NOT NULL;

ALTER TABLE `GuildChannelSettings` MODIFY `automaticSlowmodeChannels` JSON NOT NULL;

-- AlterTable
ALTER TABLE `GuildSlowmodeSettings` MODIFY `enabledChannels` JSON NOT NULL;