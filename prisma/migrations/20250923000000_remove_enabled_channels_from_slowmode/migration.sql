-- Remove unused manual slowmode channels column
ALTER TABLE `GuildSlowmodeSettings`
DROP COLUMN `enabledChannels`;