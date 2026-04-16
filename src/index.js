import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { serverConfig } from './config/index.js';
import logger from './utils/logger.js';
import requestLogger from './middleware/requestLogger.js';
import errorHandler from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { sessionMiddleware } from './middleware/session.js';
import routes from './routes/index.js';
import { initializeStorage, startFileCleanup, stopFileCleanup } from './services/storage.service.js';
import { startWorker, stopWorker } from './workers/pdf.worker.js';
import { checkCompressionTools } from './services/pdf/compress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const isProd = serverConfig.nodeEnv === 'production';

const app = express();

// ── Security headers ───────────────────────────────────────────────────
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

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Session-ID'],
}));

app.set('trust proxy', 1);

// ── Compression — gzip/brotli all responses ────────────────────────────
app.use(compression());

app.use(express.json());
app.use(requestLogger);

// ── Static files with production caching ───────────────────────────────
app.use(express.static(CLIENT_DIR, {
  maxAge: isProd ? '7d' : 0,
  etag: true,
  lastModified: true,
  immutable: false,
}));

// ── Session + Rate Limiter for all API routes ─────────────────────────
app.use('/api', sessionMiddleware, apiLimiter);

app.use('/api', routes);

// ── SPA fallback — serve index.html for non-API routes ─────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    });
  }
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

app.use(errorHandler);

// ── Start the server ───────────────────────────────────────────────────
let server;

const startServer = async () => {
  await initializeStorage();
  await checkCompressionTools();
  startWorker();
  startFileCleanup();

  server = app.listen(serverConfig.port, '0.0.0.0', () => {
    logger.info(`Server listening on 0.0.0.0:${serverConfig.port}`, {
      env: serverConfig.nodeEnv,
    });
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
};

// ── Graceful shutdown ──────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received — shutting down...`);

  stopWorker();
  stopFileCleanup();

  if (server) {
    server.close(() => {
      logger.info('Server closed.');
      process.exit(0);
    });

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

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { error: err.message, stack: err.stack });
  process.exit(1);
});

startServer().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});
