import path from 'node:path';
import { fileURLToPath } from 'node:url';

// In ES modules there's no __dirname. We reconstruct it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const storageConfig = {
  // Where uploaded files are temporarily stored before processing
  uploadDir: path.join(PROJECT_ROOT, 'uploads'),

  // Where processed/output files go after a PDF operation completes
  processedDir: path.join(PROJECT_ROOT, 'processed'),

  // 50 MB per file -- large enough for most PDFs, small enough to prevent abuse
  maxFileSize: 50 * 1024 * 1024,

  // Only accept PDF files. We check BOTH the extension and MIME type for safety.
  // Why both? Because a user can rename "virus.exe" to "virus.pdf" --
  // the extension would pass but the MIME type would not.
  allowedMimeTypes: ['application/pdf'],
  allowedExtensions: ['.pdf'],

  // Max number of files in a single upload request (e.g., merging 10 PDFs)
  maxFileCount: 10,
};

export default storageConfig;
