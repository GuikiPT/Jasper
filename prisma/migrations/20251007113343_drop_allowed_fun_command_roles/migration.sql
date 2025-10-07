-- Remove legacy fun command role bucket
ALTER TABLE `GuildRoleSettings` DROP COLUMN `allowedFunCommandRoles`;
