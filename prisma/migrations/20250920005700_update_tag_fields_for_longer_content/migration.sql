-- AlterTable
ALTER TABLE `GuildSupportTags` MODIFY `embedTitle` VARCHAR(512) NOT NULL,
MODIFY `embedDescription` TEXT NULL,
MODIFY `embedFooter` TEXT NULL,
MODIFY `embedImageUrl` VARCHAR(512) NULL;