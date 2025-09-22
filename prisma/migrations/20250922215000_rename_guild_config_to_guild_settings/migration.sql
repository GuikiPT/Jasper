-- Rename GuildConfig to GuildSettings if needed
SET @rename := (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'GuildConfig'
        )
        AND NOT EXISTS(
            SELECT 1
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'GuildSettings'
        ),
        'RENAME TABLE `GuildConfig` TO `GuildSettings`',
        'SELECT 1'
    )
);

PREPARE stmt FROM @rename;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
