// Upload routes.
//
// MIDDLEWARE CHAINING -- the key pattern here:
// Each POST route has MULTIPLE middleware that run in ORDER:
//   1. uploadSingle (multer) -- parses the multipart request, saves file to disk
//   2. validateSingleUpload -- checks file type and MIME type
//   3. uploadFile (controller) -- sends the success response
//
// If any middleware calls next(error), Express SKIPS the rest and
// jumps to the error handler. This is like a pipeline:
//   data flows through step 1 → step 2 → step 3
//   but if any step fails, the error flows to the error handler
//
// This is the functional programming "pipe" concept applied to HTTP.

import { Router } from 'express';
import { uploadSingle, uploadMultiple } from '../middleware/upload.js';
import { validateSingleUpload, validateMultipleUpload } from '../middleware/validateUpload.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = Router();

// Upload a single PDF
router.post('/', uploadSingle, validateSingleUpload, uploadController.uploadFile);

// Upload multiple PDFs (for merge operations later)
router.post('/multiple', uploadMultiple, validateMultipleUpload, uploadController.uploadFiles);

// List all uploaded files
router.get('/', uploadController.listFiles);

// Get info about a specific file
router.get('/:filename', uploadController.getFile);

// Download a file
router.get('/:filename/download', uploadController.downloadFile);

// Delete a file
router.delete('/:filename', uploadController.removeFile);

export default router;
