// Multer middleware -- handles the raw mechanics of file uploading.
//
// HOW FILE UPLOADS WORK IN HTTP:
// When a browser sends files, it uses "multipart/form-data" encoding.
// The request body is NOT JSON -- it's a binary stream with boundaries
// separating each file. Express can't parse this. Multer can.
//
// Multer reads the binary stream, saves files to disk, and puts
// file metadata on req.file (single) or req.files (multiple).
//
// We configure multer with:
//   - WHERE to store files (diskStorage)
//   - WHAT to name them (unique names to avoid collisions)
//   - HOW BIG they can be (limits)

import multer from 'multer';
import { storageConfig } from '../config/index.js';
import { generateUniqueFilename } from '../utils/fileHelpers.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, storageConfig.uploadDir);
  },

  filename: (_req, file, cb) => {
    cb(null, generateUniqueFilename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: storageConfig.maxFileSize,
    files: storageConfig.maxFileCount,
  },
});

// Export pre-configured middleware for common scenarios.
// Routes just pick the one they need: upload.single, upload.multiple, etc.
export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', storageConfig.maxFileCount);
