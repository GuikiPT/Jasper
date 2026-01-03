// Setup module - Runtime bootstrap configuration for environment, commands, and utilities
import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-editable-commands/register';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-subcommands/register';
import { setup, type ArrayString } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'path';
import { inspect } from 'util';
import { rootDir } from './constants';
import './database';

// ============================================================
// Application Command Registry Configuration
// ============================================================

// Set default behavior to bulk overwrite for slash command registration
// This ensures commands are synced with Discord when definitions change
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

// ============================================================
// Environment Configuration
// ============================================================

// Load environment variables from .env file
setup({ path: join(rootDir, '.env') });

// Set default NODE_ENV to development if not explicitly defined
process.env.NODE_ENV ??= 'development';

// ============================================================
// Utility Configuration
// ============================================================

// Set default inspection depth for console logging
inspect.defaultOptions.depth = 1;

// Enable colorette for terminal color output
colorette.createColors({ useColor: true });

// ============================================================
// Type Declarations
// ============================================================

// Extend Skyra env utilities with required environment variables
declare module '@skyra/env-utilities' {
	interface Env {
		OWNERS: ArrayString;
		DATABASE_URL: string;
		DISCORD_TOKEN: string;
	}
}
