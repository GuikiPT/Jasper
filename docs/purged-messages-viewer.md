# View Purged Messages Command

A context menu command that extracts purged messages from GearBot archives and displays them in a beautiful Discord-style format using Discord Components.

## How It Works

1. **Right-click a message** containing a `.txt` attachment from GearBot
2. **Apps → View Purged Messages**
3. Get an embed with a button to view the messages
4. **Click "View Messages"** to see the purged messages in Discord-style format

## File Format

The command parses GearBot's purged message archive format:

```
purged at 22:32:41 from 💬｜general
22:31:09 820745488231301210 - 1461457967307292702 - 1464734294193996049 | pyenv#0 (1221795593324593172) | woah | 
22:31:23 820745488231301210 - 1461457967307292702 - 1464734352696152169 | pyenv#0 (1221795593324593172) | hi | 
22:31:26 820745488231301210 - 1461457967307292702 - 1464734366474436660 | pyenv#0 (1221795593324593172) | hello world | 
```

Format:
- Line 1: Header with purge time and channel name
- Following lines: `timestamp guild_id - channel_id - message_id | username#discriminator (user_id) | content | [optional reply info]`

## Features

- ✅ **Discord-style rendering** - Messages look like real Discord messages
- ✅ **Reply detection** - Shows when messages are replies
- ✅ **User avatars** - Displays avatars based on user ID
- ✅ **Timestamps** - Shows when each message was sent
- ✅ **Channel info** - Displays which channel messages were purged from
- ✅ **Limit handling** - Shows up to 50 messages (URL length limit)

## API Routes

### `/purged/:id`
Renders purged messages in Discord-style format using a cached ID.

**Path Parameters:**
- `id` - Unique cache identifier (32-character hex string)

**How it Works:**
1. Command stores message data in an in-memory cache
2. Generates a short, unique ID
3. Creates a clean URL: `http://localhost:4000/purged/{id}`
4. Route retrieves data from cache using the ID
5. Renders the Discord-styled page

**Cache Behavior:**
- Data expires after 1 hour
- Automatic cleanup runs every 5 minutes
- Old links will show "Link Expired" error

## Example Usage

1. GearBot purges messages and posts a `.txt` archive
2. Right-click the message → Apps → "View Purged Messages"
3. Jasper analyzes the archive and shows a summary embed
4. Click the "View Messages" button
5. See all purged messages in Discord-style format

## Configuration

Set the API base URL in your `.env` file:

```env
API_BASE_URL=http://localhost:4000
```

For production, use your public URL:

```env
API_BASE_URL=https://your-domain.com
```

## Limitations

- Links expire after 1 hour (configurable in cache service)
- Only works with GearBot's text archive format
- Requires `.txt` file attachment with specific format
- In-memory cache (data lost on bot restart)

## Future Improvements

- [ ] Use database for persistent storage
- [ ] Support pagination for large archives (currently shows all messages)
- [ ] Add export functionality
- [ ] Support other purge bot formats
- [ ] Add search/filter capabilities
