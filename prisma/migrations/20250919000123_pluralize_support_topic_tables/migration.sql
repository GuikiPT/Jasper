PRAGMA foreign_keys=OFF;

ALTER TABLE "GuildSupportTag" RENAME TO "GuildSupportTags";
ALTER TABLE "GuildTopic" RENAME TO "GuildTopics";

DROP INDEX IF EXISTS "GuildSupportTag_guildId_idx";
DROP INDEX IF EXISTS "GuildSupportTag_guildId_name_key";
DROP INDEX IF EXISTS "GuildTopic_guildId_idx";
DROP INDEX IF EXISTS "GuildTopic_guildId_value_key";

CREATE INDEX "GuildSupportTags_guildId_idx" ON "GuildSupportTags"("guildId");
CREATE UNIQUE INDEX "GuildSupportTags_guildId_name_key" ON "GuildSupportTags"("guildId", "name");
CREATE INDEX "GuildTopics_guildId_idx" ON "GuildTopics"("guildId");
CREATE UNIQUE INDEX "GuildTopics_guildId_value_key" ON "GuildTopics"("guildId", "value");

PRAGMA foreign_keys=ON;
