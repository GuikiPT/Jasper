# Discord Components Integration

This document describes how to use Discord Components with the Jasper API.

## Overview

Jasper now includes a route that renders Discord-like messages using the [@skyra/discord-components-core](https://github.com/skyra-project/discord-components) library. This allows you to create beautiful, Discord-styled interfaces for previews, documentation, or web integrations.

## Quick Start

### 1. Start the Bot

The API server starts automatically when you run Jasper:

```bash
npm run dev
```

or

```bash
npm run build
npm start
```

### 2. Access the Discord Components Page

By default, the Sapphire API plugin runs on port **4000**. Open your browser to:

```
http://localhost:4000/discord
```

You should see a fully rendered page with Discord-styled messages, embeds, buttons, and reactions!

## What's Included

The `/discord` route demonstrates:

- **Bot Messages** - Messages with bot badges and verified checkmarks
- **User Mentions** - @user, #channel, and @role mentions
- **Rich Embeds** - Embeds with titles, descriptions, fields, thumbnails, and timestamps
- **Interactive Components** - Buttons with different styles (Primary, Secondary, Success, Destructive)
- **Reactions** - Message reactions with counts
- **Custom Profiles** - Configurable user profiles with avatars and role colors

## Customization

### Editing the Route

The route is located at:
```
src/routes/discord.get.ts
```

You can modify the HTML content to:
- Add new message examples
- Change the Jasper bot profile
- Customize colors and styling
- Add more Discord components

### Available Components

The library supports many Discord components:

- `<discord-messages>` - Container for messages
- `<discord-message>` - Individual message
- `<discord-mention>` - User, role, or channel mentions
- `<discord-embed>` - Rich embed
- `<discord-button>` - Interactive button
- `<discord-reaction>` - Message reaction
- `<discord-thread>` - Thread preview
- And many more!

See the [full documentation](https://github.com/skyra-project/discord-components) for all available components.

## Configuration

### Custom Profiles

Profiles are configured in the `window.$discordMessage.profiles` object. The current profiles are:

```javascript
{
  jasper: {
    author: 'Jasper Bot',
    avatar: 'https://github.com/GuikiPT.png',
    roleColor: '#5865f2',
    bot: true,
    verified: true
  },
  user: {
    author: 'User',
    avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    roleColor: '#ffffff'
  }
}
```

You can add more profiles or modify existing ones in the route file.

### API Port

The Sapphire API plugin port can be configured via environment variables. Check the Sapphire documentation for more details.

## Use Cases

This integration can be used for:

1. **Documentation** - Show example bot interactions in your docs
2. **Command Previews** - Display how commands will look in Discord
3. **Web Dashboard** - Create Discord-like interfaces in your web app
4. **Testing** - Preview embeds and messages before sending them
5. **Public API** - Provide a visual representation of bot features

## Examples

### Creating a Custom Message

```html
<discord-messages>
  <discord-message profile="jasper">
    Hello! This is a custom message.
    <discord-embed
      slot="embeds"
      color="#ff0000"
      embed-title="Custom Embed"
    >
      <discord-embed-description slot="description">
        Your custom content here!
      </discord-embed-description>
    </discord-embed>
  </discord-message>
</discord-messages>
```

### Adding a Button

```html
<discord-message profile="jasper">
  Click the button below:
  <discord-attachments slot="components">
    <discord-action-row>
      <discord-button type="primary">Click Me!</discord-button>
    </discord-action-row>
  </discord-attachments>
</discord-message>
```

## Resources

- [Discord Components Repository](https://github.com/skyra-project/discord-components)
- [Live Examples](https://github.com/skyra-project/discord-components-implementations)
- [Sapphire API Plugin](https://www.sapphirejs.dev/docs/Guide/plugins/API/getting-started)

## Troubleshooting

### Page Not Loading

1. Ensure the bot is running
2. Check that the API port (default 4000) is not blocked
3. Verify no errors in the console logs

### Components Not Rendering

1. Check browser console for JavaScript errors
2. Ensure you have a modern browser that supports Web Components
3. Try clearing cache and reloading

### Custom Styling Issues

The page uses inline CSS for simplicity. You can:
- Modify the `<style>` tag in the route
- Add external CSS files
- Use the built-in Discord Components CSS classes

---

**Note:** This is a no-framework implementation using CDN imports. For production use, consider installing the package locally and bundling with your preferred build tool.
