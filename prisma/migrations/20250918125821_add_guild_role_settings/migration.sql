-- CreateTable
CREATE TABLE "GuildRoleSettings" (
    "guildId" TEXT NOT NULL PRIMARY KEY,
    "allowedAdminRoles" JSONB NOT NULL,
    "allowedFunCommandRoles" JSONB NOT NULL,
    "allowedStaffRoles" JSONB NOT NULL,
    "allowedTagAdminRoles" JSONB NOT NULL,
    "allowedTagRoles" JSONB NOT NULL,
    "ignoredSnipedRoles" JSONB NOT NULL,
    "supportRoles" JSONB NOT NULL,
    CONSTRAINT "GuildRoleSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
