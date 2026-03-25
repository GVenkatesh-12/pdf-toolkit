import path from 'node:path';
import crypto from 'node:crypto';

// Generate a unique filename that won't collide, even with millions of uploads.
// We use a random ID + timestamp so filenames are:
//   1. Unique (no overwriting)
//   2. Sorted by time (easy to find recent files)
//   3. Unpredictable (users can't guess other users' file URLs)
export const generateUniqueFilename = (originalName) => {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomId}${ext}`;
};

// Extract just the extension, lowercased
export const getExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Get file size in a human-readable format
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
};

const sanitizeBaseName = (name) => {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'document';
};

export const buildOperationDownloadName = (files, operation) => {
  const firstFile = files?.[0];
  const originalName = firstFile?.originalname || 'document.pdf';
  const originalBase = path.basename(originalName, path.extname(originalName));
  const safeBase = sanitizeBaseName(originalBase);
  const safeOperation = sanitizeBaseName(operation).toLowerCase();

  return `${safeBase}_${safeOperation}.pdf`;
};
