// The Storage Service — handles all file system operations.
// Now session-scoped: each user gets their own upload/processed directories.

import fs from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../config/index.js';
import { NotFoundError } from '../utils/errors.js';
import { formatFileSize } from '../utils/fileHelpers.js';
import logger from '../utils/logger.js';

// Ensure root upload and processed directories exist at startup.
export const initializeStorage = async () => {
  await fs.mkdir(storageConfig.uploadDir, { recursive: true });
  await fs.mkdir(storageConfig.processedDir, { recursive: true });
  logger.info('Storage directories initialized', {
    uploadDir: storageConfig.uploadDir,
    processedDir: storageConfig.processedDir,
  });
};

// Get metadata about a file in a specific directory.
export const getFileInfo = async (directory, filename) => {
  const filePath = path.join(directory, filename);

  try {
    const stats = await fs.stat(filePath);
    return {
      filename,
      path: filePath,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      uploadedAt: stats.birthtime.toISOString(),
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`File '${filename}'`);
    }
    throw err;
  }
};

// List all PDF files in a given directory.
export const listFiles = async (directory) => {
  try {
    const filenames = await fs.readdir(directory);
    const pdfFiles = filenames.filter((f) => f.endsWith('.pdf'));
    const fileInfos = await Promise.all(
      pdfFiles.map((f) => getFileInfo(directory, f))
    );
    return fileInfos;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

// Delete a file.
export const deleteFile = async (directory, filename) => {
  const filePath = path.join(directory, filename);

  try {
    await fs.unlink(filePath);
    logger.info(`Deleted file: ${filename}`);
    return { deleted: true, filename };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`File '${filename}'`);
    }
    throw err;
  }
};

// Get the full path for a file in a directory.
export const getFilePath = (directory, filename) => {
  return path.join(directory, filename);
};

// ── File Cleanup ─────────────────────────────────────────────
// Recursively walk session directories and delete files older than fileTTL.
// Also removes empty session directories.

export const cleanupExpiredFiles = async () => {
  const ttl = storageConfig.fileTTL;
  const now = Date.now();
  let cleaned = 0;

  for (const rootDir of [storageConfig.uploadDir, storageConfig.processedDir]) {
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
          // This is a session directory — clean old files inside it
          try {
            const files = await fs.readdir(entryPath);

            for (const file of files) {
              const filePath = path.join(entryPath, file);
              try {
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > ttl) {
                  await fs.unlink(filePath);
                  cleaned++;
                }
              } catch {
                // File may have been deleted already
              }
            }

            // Remove the session directory if it's now empty
            const remaining = await fs.readdir(entryPath);
            if (remaining.length === 0) {
              await fs.rmdir(entryPath);
            }
          } catch {
            // Session directory may have been removed
          }
        } else if (entry.isFile()) {
          // Legacy file in root uploads/processed (not in a session dir)
          try {
            const stats = await fs.stat(entryPath);
            if (now - stats.mtimeMs > ttl) {
              await fs.unlink(entryPath);
              cleaned++;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // Root dir may not exist yet
    }
  }

  if (cleaned > 0) {
    logger.info(`File cleanup: removed ${cleaned} expired file(s)`);
  }
};

let cleanupTimer = null;

export const startFileCleanup = () => {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredFiles, storageConfig.cleanupInterval);
  logger.info(`File cleanup scheduled every ${storageConfig.cleanupInterval / 1000}s (TTL: ${storageConfig.fileTTL / 1000}s)`);
};

export const stopFileCleanup = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
};
