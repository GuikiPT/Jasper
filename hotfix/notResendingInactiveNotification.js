const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();
const FORUM_CHANNEL_ID = '1141179304269598751';
const REQUIRED_TAG_ID = '1144008960966402149';
const KEEP_OPEN_ACK_LINE = "We'll notify you again if we detect another period of inactivity.";
const APPLY_DATABASE_REPAIRS = process.argv.includes('--apply');

function collectComponentText(components) {
  const texts = [];

  const visit = (value) => {
    if (!value) {
      return;
    }

    const node = typeof value.toJSON === 'function' ? value.toJSON() : value;

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node !== 'object') {
      return;
    }

    if (typeof node.content === 'string') {
      texts.push(node.content);
    }

    if (Array.isArray(node.components)) {
      for (const child of node.components) {
        visit(child);
      }
    }
  };

  visit(components);
  return texts;
}

function isKeepOpenAcknowledgement(message, clientUserId) {
  if (message.author.id !== clientUserId) {
    return false;
  }

  const texts = collectComponentText(message.components);
  return texts.some((text) => text.startsWith('✅ Thread kept open by <@')) && texts.includes(KEEP_OPEN_ACK_LINE);
}

async function resolveThreadOwnerId(thread) {
  if (thread.ownerId) {
    return thread.ownerId;
  }

  try {
    const owner = await thread.fetchOwner();
    return owner?.id ?? null;
  } catch (error) {
    console.warn(`Failed to resolve owner for thread ${thread.id}:`, error.message);
    return null;
  }
}

async function inspectThread(thread, clientUserId) {
  const ownerId = await resolveThreadOwnerId(thread);
  let lastAuthorMessage = null;
  let lastKeepOpenMessage = null;
  let before;

  while (!lastAuthorMessage || !lastKeepOpenMessage) {
    const messages = await thread.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (messages.size === 0) {
      break;
    }

    const sorted = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    for (const message of sorted) {
      if (!lastAuthorMessage && ownerId && message.author.id === ownerId) {
        lastAuthorMessage = message;
      }

      if (!lastKeepOpenMessage && isKeepOpenAcknowledgement(message, clientUserId)) {
        lastKeepOpenMessage = message;
      }

      if (lastAuthorMessage && lastKeepOpenMessage) {
        break;
      }
    }

    const oldest = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)[0];
    before = oldest?.id;

    if (!before) {
      break;
    }
  }

  return { ownerId, lastAuthorMessage, lastKeepOpenMessage };
}

function formatMessageLine(label, thread, message) {
  if (!message) {
    return `  ${label}: not found`;
  }

  return `  ${label}: ${message.id} | ${new Date(message.createdTimestamp).toISOString()} | https://discord.com/channels/${thread.guildId}/${thread.id}/${message.id}`;
}

function toSqlDatetime(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

function createDatabaseClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }

  return new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL)
  });
}

function needsReminderRepair(details) {
  if (!details.lastKeepOpenMessage) {
    return false;
  }

  if (!details.lastAuthorMessage) {
    return true;
  }

  return details.lastAuthorMessage.createdTimestamp <= details.lastKeepOpenMessage.createdTimestamp;
}

function buildRepairSql(thread, details) {
  if (!details.ownerId || !details.lastAuthorMessage || !details.lastKeepOpenMessage) {
    return null;
  }

  const lastAuthorMessageAt = toSqlDatetime(details.lastKeepOpenMessage.createdTimestamp);

  return [
    'UPDATE SupportThread',
    `SET guildId = '${thread.guildId}',`,
    `    authorId = '${details.ownerId}',`,
    `    lastAuthorMessageAt = '${lastAuthorMessageAt}',`,
    `    lastAuthorMessageId = '${details.lastAuthorMessage.id}',`,
    '    closedAt = NULL,',
    '    lastReminderAt = NULL,',
    '    reminderMessageId = NULL,',
    '    reminderCount = 0',
    `WHERE threadId = '${thread.id}';`
  ].join('\n');
}

function buildRepairPayload(thread, details) {
  if (!details.ownerId || !details.lastAuthorMessage || !details.lastKeepOpenMessage) {
    return null;
  }

  return {
    threadId: thread.id,
    guildId: thread.guildId,
    authorId: details.ownerId,
    lastAuthorMessageAt: new Date(details.lastKeepOpenMessage.createdTimestamp),
    lastAuthorMessageId: details.lastAuthorMessage.id,
    closedAt: null,
    lastReminderAt: null,
    reminderMessageId: null,
    reminderCount: 0
  };
}

async function applyRepairs(repairCandidates) {
  if (repairCandidates.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  const database = createDatabaseClient();
  let updated = 0;
  let skipped = 0;

  try {
    for (const { thread, details } of repairCandidates) {
      const repairData = buildRepairPayload(thread, details);

      if (!repairData) {
        skipped += 1;
        continue;
      }

      await database.supportThread.upsert({
        where: { threadId: repairData.threadId },
        create: repairData,
        update: {
          guildId: repairData.guildId,
          authorId: repairData.authorId,
          lastAuthorMessageAt: repairData.lastAuthorMessageAt,
          lastAuthorMessageId: repairData.lastAuthorMessageId,
          closedAt: null,
          lastReminderAt: null,
          reminderMessageId: null,
          reminderCount: 0
        }
      });

      updated += 1;
    }

    return { updated, skipped };
  } finally {
    await database.$disconnect();
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Database apply mode: ${APPLY_DATABASE_REPAIRS ? 'enabled' : 'disabled'}\n`);

  try {
    const channel = await client.channels.fetch(FORUM_CHANNEL_ID);

    if (!channel || channel.type !== ChannelType.GuildForum) {
      throw new Error('The provided channel is not a forum channel.');
    }

    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const active = await channel.threads.fetchActive();
    const archived = await channel.threads.fetchArchived({
      type: 'public',
      fetchAll: true
    });

    const allThreads = new Map();

    for (const thread of active.threads.values()) {
      allThreads.set(thread.id, thread);
    }

    for (const thread of archived.threads.values()) {
      allThreads.set(thread.id, thread);
    }

    const filtered = [...allThreads.values()]
      .filter((thread) => thread.createdTimestamp && thread.createdTimestamp >= oneMonthAgo)
      .filter((thread) => !thread.appliedTags.includes(REQUIRED_TAG_ID))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    console.log(`Found ${filtered.length} threads created in the last month that are missing tag ${REQUIRED_TAG_ID}:\n`);

    const repairCandidates = [];

    for (const thread of filtered) {
      const details = await inspectThread(thread, client.user.id);
      const brokenAfterKeepOpen = needsReminderRepair(details);

      if (brokenAfterKeepOpen) {
        repairCandidates.push({ thread, details });
      }

      console.log(
        `- ${thread.name} | ${thread.id} | created: ${new Date(thread.createdTimestamp).toISOString()} | tags: ${thread.appliedTags.join(', ') || 'none'}`
      );
      console.log(`  needsReminderRepair: ${brokenAfterKeepOpen ? 'yes' : 'no'}`);
      console.log(`  ownerId: ${details.ownerId ?? 'unknown'}`);
      console.log(formatMessageLine('lastAuthorMessage', thread, details.lastAuthorMessage));
      console.log(formatMessageLine('lastKeepOpenAck', thread, details.lastKeepOpenMessage));
      console.log('');
    }

    console.log(`Repair candidates: ${repairCandidates.length}\n`);

    for (const { thread, details } of repairCandidates) {
      console.log(`- ${thread.name} | ${thread.id}`);
      console.log(`  ownerId: ${details.ownerId ?? 'unknown'}`);
      console.log(`  lastAuthorMessageId: ${details.lastAuthorMessage?.id ?? 'missing'}`);
      console.log(`  keepOpenAckId: ${details.lastKeepOpenMessage?.id ?? 'missing'}`);
      console.log(`  suggestedLastAuthorMessageAt: ${details.lastKeepOpenMessage ? toSqlDatetime(details.lastKeepOpenMessage.createdTimestamp) : 'missing'}`);

      const repairSql = buildRepairSql(thread, details);
      if (repairSql) {
        console.log(repairSql);
      } else {
        console.log('No SQL generated because one or more required values are missing.');
      }

      console.log('');
    }

    if (APPLY_DATABASE_REPAIRS) {
      const result = await applyRepairs(repairCandidates);
      console.log(`Applied ${result.updated} database repairs directly.${result.skipped > 0 ? ` Skipped ${result.skipped} candidates.` : ''}`);
    } else {
      console.log('Dry run only. Re-run with `node main.js --apply` to update the database directly.');
    }
  } catch (error) {
    console.error(error);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
