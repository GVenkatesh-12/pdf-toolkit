// This is the "barrel file" pattern.
// Instead of importing from 'config/server.js', 'config/storage.js' etc,
// other files just import from 'config/index.js' (or just 'config/').
// When you add queue config or storage config later, add them here.

export { default as serverConfig } from './server.js';
export { default as storageConfig } from './storage.js';
export { default as queueConfig } from './queue.js';
