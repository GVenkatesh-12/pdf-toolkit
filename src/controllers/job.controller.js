// The Job Controller.
//
// This replaces the old synchronous pdf.controller for actual processing.
// The key difference:
//
//   OLD (Stage 3): User uploads → Server processes → User waits → Response
//   NEW (Stage 4): User uploads → Server queues job → User gets jobId instantly
//                  User polls with jobId → Eventually gets "completed" + download URL
//
// THE POLLING PATTERN:
// The frontend will do something like:
//   1. POST /api/jobs  →  get { jobId: "abc123" }
//   2. Every 1-2 seconds: GET /api/jobs/abc123
//      Response: { state: "processing" }  →  show spinner
//      Response: { state: "completed", downloadUrl: "..." }  →  show download button
//
// This is how iLovePDF, CloudConvert, and most file processing services work.

import path from 'node:path';
import * as queue from '../services/queue.service.js';
import { getOperation } from '../services/pdf/index.js';
import { storageConfig } from '../config/index.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { buildOperationDownloadName, generateUniqueFilename } from '../utils/fileHelpers.js';

// POST /api/jobs -- create a new processing job
export const createJob = (req, res, next) => {
  try {
    const { operation } = req.body;

    if (!operation) {
      throw new ValidationError('Missing "operation" field. Specify: merge, split, compress, etc.');
    }

    // Validate the operation exists in the registry
    const operationConfig = getOperation(operation);
    const { minFiles, maxFiles } = operationConfig;

    // Get uploaded files
    const files = req.files || (req.file ? [req.file] : []);

    if (files.length < minFiles) {
      throw new ValidationError(
        `Operation "${operation}" requires at least ${minFiles} file(s), but got ${files.length}.`
      );
    }

    if (files.length > maxFiles) {
      throw new ValidationError(
        `Operation "${operation}" accepts at most ${maxFiles} file(s), but got ${files.length}.`
      );
    }

    // Build the output path
    const downloadName = buildOperationDownloadName(files, operation);
    const outputFilename = generateUniqueFilename(downloadName);
    const outputPath = path.join(storageConfig.processedDir, outputFilename);

    // Parse operation-specific options
    const options = {};
    if (req.body.start) options.start = parseInt(req.body.start, 10);
    if (req.body.end) options.end = parseInt(req.body.end, 10);
    if (req.body.level) options.level = req.body.level;

    // Add the job to the queue -- this returns IMMEDIATELY
    const job = queue.addJob({
      operation,
      inputPaths: files.map((f) => f.path),
      outputPath,
      outputFilename,
      downloadName,
      options,
    });

    // Respond with 202 Accepted (not 200 OK, not 201 Created).
    // 202 means "I received your request and will process it later."
    // This is the correct HTTP status for async operations.
    res.status(202).json({
      status: 'accepted',
      message: `Job queued for "${operation}" operation`,
      data: {
        jobId: job.id,
        state: job.state,
        pollUrl: `/api/jobs/${job.id}`,
        downloadName,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/jobs/:jobId -- check job status
export const getJobStatus = (req, res, next) => {
  try {
    const job = queue.getJob(req.params.jobId);

    if (!job) {
      throw new NotFoundError('Job');
    }

    const response = queue.formatJobForResponse(job);

    // If job is completed, add the download URL
    if (job.state === queue.JOB_STATES.COMPLETED) {
      response.downloadUrl = `/api/jobs/${job.id}/download?name=${encodeURIComponent(
        job.data.downloadName || job.data.outputFilename
      )}`;
    }

    res.json({
      status: 'success',
      data: response,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/jobs/:jobId/download -- download the processed result
export const downloadJobResult = (req, res, next) => {
  try {
    const job = queue.getJob(req.params.jobId);

    if (!job) {
      throw new NotFoundError('Job');
    }

    if (job.state !== queue.JOB_STATES.COMPLETED) {
      throw new ValidationError(
        `Job is "${job.state}". Download is only available for completed jobs.`
      );
    }

    const filePath = job.data.outputPath;
    const downloadName = typeof req.query.name === 'string'
      ? path.basename(req.query.name)
      : (job.data.downloadName || job.data.outputFilename);
    res.download(filePath, downloadName);
  } catch (err) {
    next(err);
  }
};

// GET /api/jobs -- get queue statistics
export const getStats = (_req, res) => {
  const stats = queue.getQueueStats();
  res.json({
    status: 'success',
    data: stats,
  });
};
