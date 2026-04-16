import { Router } from 'express';
import { uploadMultiple } from '../middleware/upload.js';
import { validateMultipleUpload } from '../middleware/validateUpload.js';
import { validatePdfMagicBytes, sanitizeFilename } from '../middleware/security.js';
import * as pdfController from '../controllers/pdf.controller.js';

const router = Router();

router.get('/operations', pdfController.getOperations);

router.post('/:operation',
  uploadMultiple,
  validateMultipleUpload,
  validatePdfMagicBytes,
  pdfController.processOperation
);

router.get('/download/:filename', sanitizeFilename, pdfController.downloadProcessed);

export default router;
