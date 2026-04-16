import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const storageConfig = {
  uploadDir: path.join(PROJECT_ROOT, 'uploads'),
  processedDir: path.join(PROJECT_ROOT, 'processed'),

  // 50 MB per file
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024 || 50 * 1024 * 1024,

  allowedMimeTypes: ['application/pdf'],
  allowedExtensions: ['.pdf'],

  maxFileCount: 10,

  // Auto-delete uploaded and processed files after this many milliseconds.
  // Default: 1 hour. Prevents disk from filling up when many users upload.
  fileTTL: parseInt(process.env.FILE_TTL_MS, 10) || 60 * 60 * 1000,

  // How often the cleanup task runs (default 10 minutes)
  cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 10 * 60 * 1000,
};

export default storageConfig;
