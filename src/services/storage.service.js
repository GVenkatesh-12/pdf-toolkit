// The Storage Service.
//
// KEY CONCEPT: This service handles all file system operations.
// No other part of the app should directly use fs to read/write files.
//
// WHY centralize file operations?
//   1. If you later switch from local disk to cloud storage (S3, GCS),
//      you change THIS ONE FILE and nothing else.
//   2. All file error handling is in one place.
//   3. File cleanup logic lives here, not scattered across controllers.
//
// FUNCTIONAL APPROACH: Each function takes explicit inputs and returns
// explicit outputs. No hidden state, no global variables.

import fs from 'node:fs/promises';
import path from 'node:path';
import { storageConfig } from '../config/index.js';
import { NotFoundError } from '../utils/errors.js';
import { formatFileSize } from '../utils/fileHelpers.js';
import logger from '../utils/logger.js';

// Ensure upload and processed directories exist.
// Called once at startup. Using "recursive: true" means it won't error
// if the directory already exists (idempotent -- safe to call multiple times).
export const initializeStorage = async () => {
  await fs.mkdir(storageConfig.uploadDir, { recursive: true });
  await fs.mkdir(storageConfig.processedDir, { recursive: true });
  logger.info('Storage directories initialized', {
    uploadDir: storageConfig.uploadDir,
    processedDir: storageConfig.processedDir,
  });
};

// Get metadata about an uploaded file.
// Returns a plain object (data) -- not an HTTP response, not a class instance.
// This is the functional approach: functions return DATA, callers decide what to do with it.
export const getFileInfo = async (filename) => {
  const filePath = path.join(storageConfig.uploadDir, filename);

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

// List all uploaded files with their metadata.
export const listUploadedFiles = async () => {
  try {
    const filenames = await fs.readdir(storageConfig.uploadDir);
    const pdfFiles = filenames.filter((f) => f.endsWith('.pdf'));
    const fileInfos = await Promise.all(pdfFiles.map(getFileInfo));
    return fileInfos;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

// Delete an uploaded file.
export const deleteFile = async (filename) => {
  const filePath = path.join(storageConfig.uploadDir, filename);

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

// Get the full path for an uploaded file (used for downloads).
export const getFilePath = (directory, filename) => {
  return path.join(directory, filename);
};
