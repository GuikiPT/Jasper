-- CreateTable
CREATE TABLE "GuildChannelSettings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "allowedSkullboardChannels" JSONB NOT NULL,
    "allowedSnipeChannels" JSONB NOT NULL,
    "allowedTagChannels" JSONB NOT NULL,
    "automaticSlowmodeChannels" JSONB NOT NULL,
    CONSTRAINT "GuildChannelSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
