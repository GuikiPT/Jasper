-- CreateTable
CREATE TABLE `GuildRoleSettings` (
	`guildId` VARCHAR(191) NOT NULL,
	`allowedAdminRoles` JSON NOT NULL,
	`allowedFunCommandRoles` JSON NOT NULL,
	`allowedStaffRoles` JSON NOT NULL,
	`allowedTagAdminRoles` JSON NOT NULL,
	`allowedTagRoles` JSON NOT NULL,
	`ignoredSnipedRoles` JSON NOT NULL,
	`supportRoles` JSON NOT NULL,
	PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER
SET
	utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GuildRoleSettings` ADD CONSTRAINT `GuildRoleSettings_guildId_fkey` FOREIGN KEY (`guildId`) REFERENCES `GuildConfig` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;