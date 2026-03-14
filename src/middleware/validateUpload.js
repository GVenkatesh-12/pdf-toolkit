// Validation middleware -- runs AFTER multer has saved the file.
//
// WHY validate after saving, not before?
// Multer needs to read the stream to know what the file is. We can't
// inspect a file that hasn't been received yet. So the flow is:
//   1. Multer saves the file to disk
//   2. This middleware checks if it's valid
//   3. If invalid, we delete the file and return an error
//
// This is the "validate and reject" pattern. It's simpler and more
// reliable than trying to validate mid-stream.
//
// MIDDLEWARE COMPOSITION: In the route, these will be chained:
//   router.post('/', uploadSingle, validateSingleUpload, controller)
// Each middleware does ONE thing, then calls next().

import fs from 'node:fs/promises';
import { storageConfig } from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
import { getExtension } from '../utils/fileHelpers.js';
import logger from '../utils/logger.js';

// Helper: delete an invalid file so it doesn't pile up on disk
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch {
    // File might already be gone -- that's fine
  }
};

// Validate a single file upload
export const validateSingleUpload = async (req, _res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError('No file provided. Send a PDF file in the "file" field.');
    }

    const { file } = req;
    const ext = getExtension(file.originalname);

    if (!storageConfig.allowedExtensions.includes(ext)) {
      await cleanupFile(file.path);
      throw new ValidationError(
        `Invalid file type "${ext}". Only PDF files are allowed.`
      );
    }

    if (!storageConfig.allowedMimeTypes.includes(file.mimetype)) {
      await cleanupFile(file.path);
      throw new ValidationError(
        `Invalid MIME type "${file.mimetype}". Only application/pdf is allowed.`
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

// Validate multiple file uploads
export const validateMultipleUpload = async (req, _res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No files provided. Send PDF files in the "files" field.');
    }

    for (const file of req.files) {
      const ext = getExtension(file.originalname);

      if (!storageConfig.allowedExtensions.includes(ext)) {
        // Clean up ALL uploaded files if any one is invalid
        await Promise.all(req.files.map((f) => cleanupFile(f.path)));
        throw new ValidationError(
          `Invalid file type "${ext}" for "${file.originalname}". Only PDF files are allowed.`
        );
      }

      if (!storageConfig.allowedMimeTypes.includes(file.mimetype)) {
        await Promise.all(req.files.map((f) => cleanupFile(f.path)));
        throw new ValidationError(
          `Invalid MIME type for "${file.originalname}". Only PDF files are allowed.`
        );
      }
    }

    logger.debug(`Validated ${req.files.length} file(s) for upload`);
    next();
  } catch (err) {
    next(err);
  }
};
