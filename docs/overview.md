---
sidebar_position: 1
---

# Overview

Jasper Revamp is the next generation of my Jasper moderation assistant. It blends the original Jasper feature set with a fully typed Sapphire stack, Prisma-powered storage, and a deployment story that scales from single community servers to partner networks.

## Feature highlights

- **Guild aware configuration**: Prefix, channel policies, role whitelists, and support workflows live in MySQL tables, exposed through typed services in `src/services/**`.
- **Realtime moderation tooling**: Slowmode automations, message sniping, topic rotation, and ticket workflows ship as slash commands with granular permission checks.
- **Support knowledge base**: Tag, topic, and resolve commands keep helper responses consistent. Export and import helpers support migrations between guilds.
- **Robust logging**: The custom `JasperLogger` wraps the Sapphire logger so command handlers, Prisma events, and service layers emit structured logs to console and file outputs.

## Tech stack

| Layer | Details |
| --- | --- |
| Runtime | Node.js 20+, Sapphire Framework, Discord.js 14 |
| Language | TypeScript with project references and strict compiler options |
| Persistence | MySQL (Prisma schema in `prisma/schema.prisma`) |
| Configuration | `.env` loaded via `@skyra/env-utilities`, with typed keys for `DISCORD_TOKEN`, `DATABASE_URL`, and `OWNERS` |
| Hosting | Docker or bare Node.js service with systemd/PM2 |

## Repository layout

```
E:/Dev-Workspace/jasperrevamp
??? prisma/              # Prisma schema and migrations
??? src/
?   ??? commands/        # Slash command implementations grouped by domain
?   ??? interaction-handlers/  # Autocomplete, modal, and pagination logic
?   ??? listeners/       # Discord and custom event listeners
?   ??? services/        # Business logic around Prisma models
?   ??? subcommands/     # Sapphire subcommand entries per feature area
?   ??? lib/             # Logger, database bootstrap, environment setup
??? package.json         # Scripts for development, build, and Prisma tasks
```

Read the next sections for setup instructions and a command-by-command reference.
