// Session middleware — isolates users from each other.
//
// PROBLEM: If 50 users are using the app simultaneously,
// they'll all upload to the same directory. User A could
// potentially access User B's files.
//
// SOLUTION: Each browser gets a unique session ID (generated client-side,
// stored in sessionStorage). The server uses this to namespace files:
//   uploads/<sessionId>/file.pdf
//   processed/<sessionId>/output.pdf
//
// No cookies needed. The session ID is sent via X-Session-ID header
// or a query param. If no session ID is provided, we generate one.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../config/index.js';

// Validate session ID format — must be a UUID-like string
const SESSION_ID_PATTERN = /^[a-zA-Z0-9\-]{8,64}$/;

export const sessionMiddleware = async (req, _res, next) => {
  let sessionId = req.headers['x-session-id'] || req.query.sessionId;

  // Validate the session ID format to prevent path traversal
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    sessionId = crypto.randomUUID();
  }

  // Extra safety: strip any dangerous characters
  sessionId = sessionId.replace(/[^a-zA-Z0-9\-]/g, '');

  req.sessionId = sessionId;

  // Ensure session directories exist
  const sessionUploadDir = path.join(storageConfig.uploadDir, sessionId);
  const sessionProcessedDir = path.join(storageConfig.processedDir, sessionId);

  await fs.mkdir(sessionUploadDir, { recursive: true });
  await fs.mkdir(sessionProcessedDir, { recursive: true });

  req.sessionUploadDir = sessionUploadDir;
  req.sessionProcessedDir = sessionProcessedDir;

  next();
};
