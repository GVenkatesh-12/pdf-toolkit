// Multer middleware — handles file uploading with session-scoped storage.
//
// Each user's files go into their own session directory:
//   uploads/<sessionId>/file.pdf
// This prevents users from accessing each other's files.

import multer from 'multer';
import { storageConfig } from '../config/index.js';
import { generateUniqueFilename } from '../utils/fileHelpers.js';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Use session-scoped directory if available, else fall back to root
    const dir = req.sessionUploadDir || storageConfig.uploadDir;
    cb(null, dir);
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

export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', storageConfig.maxFileCount);
