// constants module within lib
import { join } from 'path';

// Centralised path and message constants reused throughout the project.

export const rootDir = join(__dirname, '..', '..');
export const srcDir = join(rootDir, 'src');

export const RandomLoadingMessage = ['Computing...', 'Thinking...', 'Cooking some food', 'Give me a moment', 'Loading...'];
