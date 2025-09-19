PRAGMA foreign_keys=OFF;

-- Rename tables
ALTER TABLE "SupportTag" RENAME TO "GuildSupportTag";
ALTER TABLE "Topic" RENAME TO "GuildTopic";

-- Drop old indexes if they still exist
DROP INDEX IF EXISTS "SupportTag_guildId_idx";
DROP INDEX IF EXISTS "SupportTag_guildId_name_key";
DROP INDEX IF EXISTS "Topic_guildId_idx";
DROP INDEX IF EXISTS "Topic_guildId_value_key";

-- Recreate indexes with new names
CREATE INDEX "GuildSupportTag_guildId_idx" ON "GuildSupportTag"("guildId");
CREATE UNIQUE INDEX "GuildSupportTag_guildId_name_key" ON "GuildSupportTag"("guildId", "name");
CREATE INDEX "GuildTopic_guildId_idx" ON "GuildTopic"("guildId");
CREATE UNIQUE INDEX "GuildTopic_guildId_value_key" ON "GuildTopic"("guildId", "value");

PRAGMA foreign_keys=ON;
