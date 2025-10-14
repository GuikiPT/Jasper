-- AlterTable
ALTER TABLE `GuildSupportSettings`
    ADD COLUMN `inactivityReminderMinutes` INTEGER NULL,
    ADD COLUMN `autoCloseMinutes` INTEGER NULL;

-- Transfer existing hour-based values into minute columns
UPDATE `GuildSupportSettings`
SET
    `inactivityReminderMinutes` = COALESCE(`inactivityReminderHours`, 48) * 60,
    `autoCloseMinutes` = COALESCE(`autoCloseHours`, 24) * 60;

-- Enforce defaults and non-null constraints on the new columns
ALTER TABLE `GuildSupportSettings`
    MODIFY `inactivityReminderMinutes` INTEGER NOT NULL DEFAULT 2880,
    MODIFY `autoCloseMinutes` INTEGER NOT NULL DEFAULT 1440;

-- Remove the old hour-based columns
ALTER TABLE `GuildSupportSettings`
    DROP COLUMN `inactivityReminderHours`,
    DROP COLUMN `autoCloseHours`;
