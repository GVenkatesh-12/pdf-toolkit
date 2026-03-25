// Job routes.
//
// The complete async flow from the user's perspective:
//
//   1. POST /api/jobs  (with files + operation name)
//      → 202 Accepted { jobId: "abc-123", pollUrl: "/api/jobs/abc-123" }
//
//   2. GET /api/jobs/abc-123  (poll every 1-2 seconds)
//      → { state: "queued" }       -- waiting in line
//      → { state: "processing" }   -- worker is on it
//      → { state: "completed", downloadUrl: "/api/jobs/abc-123/download" }
//
//   3. GET /api/jobs/abc-123/download
//      → The processed PDF file

import { Router } from 'express';
import { uploadMultiple } from '../middleware/upload.js';
import { validateMultipleUpload } from '../middleware/validateUpload.js';
import * as jobController from '../controllers/job.controller.js';

const router = Router();

// Get queue statistics (how many jobs queued, processing, completed, failed)
router.get('/', jobController.getStats);

// Create a new job (upload files + specify operation)
router.post('/', uploadMultiple, validateMultipleUpload, jobController.createJob);

// Check job status (the polling endpoint)
router.get('/:jobId', jobController.getJobStatus);

// Download the result of a completed job
router.get('/:jobId/download', jobController.downloadJobResult);

export default router;
