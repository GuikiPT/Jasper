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
| AI Services | Groq, Google Gemini, or Ollama (self-hosted) for topic generation |
| Configuration | `.env` loaded via `@skyra/env-utilities`, with typed keys for Discord, database, AI providers, and feature flags |
| Hosting | Docker or bare Node.js service with systemd/PM2 |

## Environment Configuration

Jasper requires several environment variables to function properly. Create a `.env` file in the project root with the following configuration:

### Required Configuration

```bash
# ============================================================
# Discord Bot Configuration (Required)
# ============================================================
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_bot_client_id_here

# ============================================================
# Database Configuration (Required)
# ============================================================
DATABASE_URL=mysql://user:password@localhost:3306/jasper
```

### AI Provider Configuration

```bash
# ============================================================
# AI Provider Selection (Required for /topic-ai command)
# ============================================================
# Choose one: 'groq', 'gemini', or 'ollama'
AI_PROVIDER=groq

# Groq Configuration (if AI_PROVIDER=groq)
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile  # Optional, default shown

# Google Gemini Configuration (if AI_PROVIDER=gemini)
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama Configuration (if AI_PROVIDER=ollama)
OLLAMA_BASE_URL=http://ollama:11434  # URL to your Ollama server
OLLAMA_MODEL=llama3.2  # Optional, default shown
```

### Optional Configuration

```bash
# ============================================================
# Bot Owners (Optional)
# ============================================================
# Comma-separated Discord user IDs with elevated permissions
OWNERS=123456789012345678,987654321098765432

# ============================================================
# Support Thread Monitoring (Optional)
# ============================================================
# Comma-separated thread IDs to skip inactivity tracking
IGNORE_SUPPORT_THREAD_INACTIVE_VERIFICATION=1234567890123456,9876543210987654

# ============================================================
# VirusTotal Integration (Optional)
# ============================================================
# API key for /virustotal commands
VIRUSTOTAL_API_KEY=your_virustotal_api_key_here
```

### AI Provider Comparison

| Provider | Speed | Cost | Rate Limits | Privacy | Setup |
|----------|-------|------|-------------|---------|-------|
| **Groq** | ⚡ Very Fast | Free tier + paid | Generous | Cloud | Easy |
| **Gemini** | 🚀 Fast | Free tier + paid | Moderate | Cloud | Easy |
| **Ollama** | 🐢 Slower | Free (self-hosted) | None | 🔒 Private | Moderate |

See [AI_PROVIDER_QUICKSTART.md](../AI_PROVIDER_QUICKSTART.md) for detailed AI setup instructions.

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
