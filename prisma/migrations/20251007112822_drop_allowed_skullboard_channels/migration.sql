-- Drop the unused skullboard channel configuration bucket
ALTER TABLE `GuildChannelSettings` DROP COLUMN `allowedSkullboardChannels`;
