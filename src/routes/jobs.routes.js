import { Router } from 'express';
import { uploadMultiple } from '../middleware/upload.js';
import { validateMultipleUpload } from '../middleware/validateUpload.js';
import { validatePdfMagicBytes } from '../middleware/security.js';
import { jobLimiter } from '../middleware/rateLimiter.js';
import * as jobController from '../controllers/job.controller.js';

const router = Router();

router.get('/', jobController.getStats);

router.post('/',
  jobLimiter,
  uploadMultiple,
  validateMultipleUpload,
  validatePdfMagicBytes,
  jobController.createJob
);

router.get('/:jobId', jobController.getJobStatus);
router.get('/:jobId/download', jobController.downloadJobResult);

export default router;
