// Security middleware — defends against common attack vectors.
//
// PATH TRAVERSAL ATTACK:
//   A user could send: GET /api/upload/../../../etc/passwd
//   Without validation, the server would serve the system password file.
//   Our defense: reject any filename containing ".." or path separators.
//
// PDF MAGIC BYTES:
//   A user could rename "virus.exe" to "virus.pdf" — the extension passes.
//   We also need to check that the file ACTUALLY starts with "%PDF-".
//   This is called "magic byte" validation.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '../utils/errors.js';

// Validate that a filename doesn't try to escape the upload directory
export const sanitizeFilename = (req, _res, next) => {
  const filename = req.params.filename;
  if (!filename) return next();

  // Block path traversal attempts
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') // null byte injection
  ) {
    return next(new ValidationError('Invalid filename.'));
  }

  // Only allow alphanumeric, hyphens, underscores, dots
  if (!/^[\w\-.][\w\-.]*$/.test(filename)) {
    return next(new ValidationError('Invalid filename characters.'));
  }

  next();
};

// Validate PDF magic bytes after multer saves the file
export const validatePdfMagicBytes = async (req, _res, next) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    
    for (const file of files) {
      const handle = await fs.open(file.path, 'r');
      try {
        const buffer = Buffer.alloc(5);
        await handle.read(buffer, 0, 5, 0);
        const header = buffer.toString('ascii');
        
        if (!header.startsWith('%PDF-')) {
          // Clean up this fake PDF
          await fs.unlink(file.path).catch(() => {});
          throw new ValidationError(
            `File "${file.originalname}" is not a valid PDF. ` +
            'The file header does not match the PDF format.'
          );
        }
      } finally {
        await handle.close();
      }
    }

    next();
  } catch (err) {
    // If it's already our ValidationError, pass it through
    if (err instanceof ValidationError) return next(err);
    next(err);
  }
};
