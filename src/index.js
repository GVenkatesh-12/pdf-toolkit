// Load environment variables FIRST, before anything else imports config
import 'dotenv/config';

import express from 'express';
import { serverConfig } from './config/index.js';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import errorHandler from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { initializeStorage } from './services/storage.service.js';

// ── Create the app ─────────────────────────────────────────────────────
const app = express();

// ── Built-in middleware ────────────────────────────────────────────────
// express.json() parses incoming JSON request bodies.
// Without this, req.body would be undefined for POST requests.
app.use(express.json());

// ── Custom middleware (order matters!) ─────────────────────────────────
// requestLogger runs FIRST on every request
app.use(requestLogger);

// ── Routes ─────────────────────────────────────────────────────────────
// All routes are prefixed with /api
// So health.routes.js '/' becomes '/api/health'
app.use('/api', routes);

// ── 404 handler (after all routes) ─────────────────────────────────────
// If no route matched, this runs. It must come AFTER all route registrations.
app.use((req, res, _next) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Error handler (must be LAST) ───────────────────────────────────────
// Express requires error handlers to be registered after everything else.
app.use(errorHandler);

// ── Start the server ───────────────────────────────────────────────────
// We use an async IIFE (Immediately Invoked Function Expression) because
// top-level await works in ES modules, but wrapping startup in a function
// gives us a clean place to handle initialization errors.
const startServer = async () => {
  await initializeStorage();

  app.listen(serverConfig.port, () => {
    logger.info(`Server running on http://localhost:${serverConfig.port}`, {
      env: serverConfig.nodeEnv,
    });
  });
};

startServer().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
