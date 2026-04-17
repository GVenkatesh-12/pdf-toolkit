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
router.delete('/:jobId', jobController.cancelJob);

// sendBeacon fallback: browsers can only POST on unload, so accept
// POST with ?_method=DELETE as a cancel signal.
router.post('/:jobId', (req, res, next) => {
  if (req.query._method === 'DELETE') {
    return jobController.cancelJob(req, res, next);
  }
  res.status(405).json({ status: 'error', message: 'Method not allowed' });
});

router.get('/:jobId/download', jobController.downloadJobResult);

export default router;
