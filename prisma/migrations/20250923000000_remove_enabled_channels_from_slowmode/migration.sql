-- Remove unused manual slowmode channels column
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

SET @dropSlowmodeEnabledChannels := IF(
	@hasGuildSlowmodeSettings AND @hasEnabledChannelsColumn,
	'ALTER TABLE `GuildSlowmodeSettings` DROP COLUMN `enabledChannels`',
	'SELECT 1'
);

PREPARE stmt FROM @dropSlowmodeEnabledChannels;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
