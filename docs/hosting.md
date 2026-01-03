---
sidebar_position: 2
---

# Hosting Guide

These notes cover the workflow I use to install, configure, and ship the Jasper Revamp bot. The repository lives at `E:/Dev-Workspace/jasperrevamp` on my development machine, but any Linux host with Node.js 20+ can run it.

## 1. Clone and install

```bash
# inside your workspace
git clone git@github.com:GuikiPT/jasper-revamp.git jasperrevamp
cd jasperrevamp
npm install
```

Run `npm run db:generate` after the first install to generate the Prisma client.

## 2. Configure environment variables

Create `.env` in the project root:

```env
DISCORD_TOKEN=your_bot_token
DATABASE_URL=mysql://user:password@localhost:3306/jasper
OWNERS=123456789012345678,987654321098765432
IGNORE_SUPPORT_THREAD_INACTIVE_VERIFICATION=123456789012345678,987654321098765432
NODE_ENV=production
```

- `DISCORD_TOKEN`: The bot token from the Discord Developer Portal.
- `DATABASE_URL`: MySQL connection string. Aurora/MySQL 8.x or MariaDB 10.x both work.
- `OWNERS`: Comma separated list of Discord user IDs that should bypass owner checks.
- `IGNORE_SUPPORT_THREAD_INACTIVE_VERIFICATION`: Comma separated support thread IDs that should be skipped by inactivity tracking (no reminders/auto-close/prune).

## 3. Provision the database

Run the Prisma migrations against your database:

```bash
npm run db:deploy
```

For a fresh development environment, use `npm run db:dev-setup` to validate the schema, reset the database, regenerate the client, and seed defaults.

## 4. Development workflow

```bash
# Watch TypeScript, rebuild on change, and relaunch the bot
defaultEnvironment=development npm run watch:start
```

Commands live reload through `tsc-watch` so interaction changes sync quickly.

## 5. Production runtime

Recommended steps for a small VPS or container:

```bash
npm run build
npm run start
```

For process supervision use PM2 or systemd. Example systemd unit:

```ini
[Unit]
Description=Jasper Revamp Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/jasperrevamp
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
User=bot
Group=bot

[Install]
WantedBy=multi-user.target
```

## 6. Command registration

The Sapphire CLI handles slash command registration via bulk overwrite. Run this anytime you add or remove commands:

```bash
npm run sapphire deploy:slash
```

(If you prefer guild-level registration during development, adjust `.sapphirerc.json` targets.)

## 7. Monitoring and logs

- Structured logs go through `src/lib/logger.ts`. Update log levels with environment variables or the logger config in `src/index.ts`.
- Slow database queries (>3s) are flagged by Prisma event listeners in `src/lib/database.ts`.
- Use `npm run db:studio` for a web UI over the Prisma schema when debugging.

With the bot online, continue to the [Commands](commands) catalogue to explore available interactions and support workflows.
