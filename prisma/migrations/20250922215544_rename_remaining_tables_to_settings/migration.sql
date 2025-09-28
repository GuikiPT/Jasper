SET @hasGuildSupportTagSettings := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildSupportTagSettings'
	)
);

SET @createGuildSupportTagSettings := IF(
	@hasGuildSupportTagSettings = 0,
	'CREATE TABLE `GuildSupportTagSettings` (
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
	) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
	'SELECT 1'
);

PREPARE stmt FROM @createGuildSupportTagSettings;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- CreateTable
SET @hasGuildTopicSettings := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildTopicSettings'
	)
);

SET @createGuildTopicSettings := IF(
	@hasGuildTopicSettings = 0,
	'CREATE TABLE `GuildTopicSettings` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`guildId` VARCHAR(191) NOT NULL,
		`value` VARCHAR(191) NOT NULL,
		`createdAt` DATETIME (3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME (3) NOT NULL,
		INDEX `GuildTopicSettings_guildId_idx` (`guildId`),
		UNIQUE INDEX `GuildTopicSettings_guildId_value_key` (`guildId`, `value`),
		PRIMARY KEY (`id`)
	) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
	'SELECT 1'
);

PREPARE stmt FROM @createGuildTopicSettings;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Copy data from old tables to new tables (skip when legacy tables are already gone)
SET @hasGuildSupportTags := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildSupportTags'
	)
);

SET @supportTagInsert := IF(
	@hasGuildSupportTags,
	'INSERT INTO GuildSupportTagSettings (id, guildId, name, authorId, editedBy, embedTitle, embedDescription, embedFooter, embedImageUrl, createdAt, updatedAt) SELECT id, guildId, name, authorId, editedBy, embedTitle, embedDescription, embedFooter, embedImageUrl, createdAt, updatedAt FROM GuildSupportTags',
	'SELECT 1'
);

PREPARE stmt FROM @supportTagInsert;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @hasGuildTopics := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildTopics'
	)
);

SET @topicInsert := IF(
	@hasGuildTopics,
	'INSERT INTO GuildTopicSettings (id, guildId, value, createdAt, updatedAt) SELECT id, guildId, value, createdAt, updatedAt FROM GuildTopics',
	'SELECT 1'
);

PREPARE stmt FROM @topicInsert;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop old tables
DROP TABLE IF EXISTS GuildSupportTags;

DROP TABLE IF EXISTS GuildTopics;

-- AddForeignKey
SET @hasSupportTagConstraint := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLE_CONSTRAINTS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildSupportTagSettings'
			AND CONSTRAINT_NAME = 'GuildSupportTagSettings_guildId_fkey'
	)
);

SET @supportTagConstraint := IF(
	@hasSupportTagConstraint = 0,
	'ALTER TABLE `GuildSupportTagSettings` ADD CONSTRAINT `GuildSupportTagSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
	'SELECT 1'
);

PREPARE stmt FROM @supportTagConstraint;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- AddForeignKey
SET @hasTopicConstraint := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLE_CONSTRAINTS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildTopicSettings'
			AND CONSTRAINT_NAME = 'GuildTopicSettings_guildId_fkey'
	)
);

SET @topicConstraint := IF(
	@hasTopicConstraint = 0,
	'ALTER TABLE `GuildTopicSettings` ADD CONSTRAINT `GuildTopicSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildSettings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE',
	'SELECT 1'
);

PREPARE stmt FROM @topicConstraint;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
SET @hasGuildSlowmodeSettings := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.TABLES
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildSlowmodeSettings'
	)
);

SET @hasEnabledChannelsColumn := (
	SELECT EXISTS (
		SELECT 1
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'GuildSlowmodeSettings'
			AND COLUMN_NAME = 'enabledChannels'
	)
);

SET @alterSlowmodeEnabledChannels := IF(
	@hasGuildSlowmodeSettings AND @hasEnabledChannelsColumn,
	'ALTER TABLE `GuildSlowmodeSettings` MODIFY `enabledChannels` JSON NOT NULL',
	'SELECT 1'
);

PREPARE stmt FROM @alterSlowmodeEnabledChannels;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
