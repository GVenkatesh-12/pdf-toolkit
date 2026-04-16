import { Router } from 'express';
import { uploadSingle, uploadMultiple } from '../middleware/upload.js';
import { validateSingleUpload, validateMultipleUpload } from '../middleware/validateUpload.js';
import { validatePdfMagicBytes } from '../middleware/security.js';
import { sanitizeFilename } from '../middleware/security.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = Router();

router.post('/',
  uploadLimiter,
  uploadSingle,
  validateSingleUpload,
  validatePdfMagicBytes,
  uploadController.uploadFile
);

router.post('/multiple',
  uploadLimiter,
  uploadMultiple,
  validateMultipleUpload,
  validatePdfMagicBytes,
  uploadController.uploadFiles
);

router.get('/', uploadController.listFiles);
router.get('/:filename', sanitizeFilename, uploadController.getFile);
router.get('/:filename/download', sanitizeFilename, uploadController.downloadFile);
router.delete('/:filename', sanitizeFilename, uploadController.removeFile);

export default router;
