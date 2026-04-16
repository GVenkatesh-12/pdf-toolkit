// Entry point — assembles and starts everything.
// Now includes security middleware, session isolation, and graceful shutdown.

import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { serverConfig } from './config/index.js';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import errorHandler from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { sessionMiddleware } from './middleware/session.js';
import routes from './routes/index.js';
import { initializeStorage, startFileCleanup, stopFileCleanup } from './services/storage.service.js';
import { startWorker, stopWorker } from './workers/pdf.worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');

// ── Create the app ─────────────────────────────────────────────────────
const app = express();

// ── Security middleware (runs FIRST) ───────────────────────────────────
// Helmet sets security headers: CSP, HSTS, X-Frame-Options, etc.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — configurable allowed origins
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Session-ID'],
}));

// Trust proxy (for rate limiter to work behind reverse proxies like nginx)
app.set('trust proxy', 1);

// ── Built-in middleware ────────────────────────────────────────────────
app.use(express.json());

// ── Custom middleware (order matters!) ─────────────────────────────────
app.use(requestLogger);

// ── Static files (frontend) ──────────────────────────────────────────
app.use(express.static(CLIENT_DIR));

// ── Session + Rate Limiter for all API routes ─────────────────────────
app.use('/api', sessionMiddleware, apiLimiter);

// ── API Routes ──────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 handler ─────────────────────────────────────────────────────
app.use((req, res, _next) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Error handler (must be LAST) ───────────────────────────────────────
app.use(errorHandler);

// ── Start the server ───────────────────────────────────────────────────
let server;

const startServer = async () => {
  await initializeStorage();
  startWorker();
  startFileCleanup();

  server = app.listen(serverConfig.port, () => {
    logger.info(`Server running on http://localhost:${serverConfig.port}`, {
      env: serverConfig.nodeEnv,
    });
  });
};

// ── Graceful shutdown ──────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  
  stopWorker();
  stopFileCleanup();

  if (server) {
    server.close(() => {
      logger.info('Server closed. Bye!');
      process.exit(0);
    });

    // Force exit after 10s if connections aren't closing
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10_000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
