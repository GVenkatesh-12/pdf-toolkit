// PDF operation routes.
//
// THE DYNAMIC ROUTE PATTERN:
// Instead of having /api/pdf/merge, /api/pdf/split, /api/pdf/compress
// as separate routes, we have ONE route: /api/pdf/:operation
//
// The :operation part is a URL parameter. Express captures it and puts
// it in req.params.operation. The controller then looks it up in the registry.
//
// This means adding a new operation to the registry AUTOMATICALLY
// creates a new API endpoint. No route changes needed.
//
// MIDDLEWARE CHAIN for the process route:
//   uploadMultiple → validateMultipleUpload → processOperation
//   (multer saves)   (check file types)       (run the operation)

import { Router } from 'express';
import { uploadMultiple } from '../middleware/upload.js';
import { validateMultipleUpload } from '../middleware/validateUpload.js';
import * as pdfController from '../controllers/pdf.controller.js';

const router = Router();

// List all available operations (no upload needed)
router.get('/operations', pdfController.getOperations);

// Download a processed file
router.get('/download/:filename', pdfController.downloadProcessed);

// Execute any PDF operation -- the :operation param is dynamic
router.post(
  '/:operation',
  uploadMultiple,
  validateMultipleUpload,
  pdfController.processOperation,
);

export default router;
