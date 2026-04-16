// The Job Controller — session-scoped async processing.
import path from 'node:path';
import * as queue from '../services/queue.service.js';
import { getOperation } from '../services/pdf/index.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { buildOperationDownloadName, generateUniqueFilename } from '../utils/fileHelpers.js';

// POST /api/jobs -- create a new processing job
export const createJob = (req, res, next) => {
  try {
    const { operation } = req.body;

    if (!operation) {
      throw new ValidationError('Missing "operation" field. Specify: merge, split, compress, etc.');
    }

    const operationConfig = getOperation(operation);
    const { minFiles, maxFiles } = operationConfig;

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

    const downloadName = buildOperationDownloadName(files, operation);
    const outputFilename = generateUniqueFilename(downloadName);
    // Session-scoped output directory
    const outputDir = req.sessionProcessedDir;
    const outputPath = path.join(outputDir, outputFilename);

    // Parse all possible operation options
    const options = {};
    if (req.body.start) options.start = parseInt(req.body.start, 10);
    if (req.body.end) options.end = parseInt(req.body.end, 10);
    if (req.body.level) options.level = req.body.level;
    if (req.body.angle) options.angle = parseInt(req.body.angle, 10);
    if (req.body.pages) options.pages = req.body.pages;
    if (req.body.text) options.text = req.body.text;
    if (req.body.opacity) options.opacity = req.body.opacity;
    if (req.body.color) options.color = req.body.color;
    if (req.body.position) options.position = req.body.position;
    if (req.body.format) options.format = req.body.format;
    if (req.body.startNumber) options.startNumber = req.body.startNumber;
    if (req.body.password) options.password = req.body.password;

    const job = queue.addJob({
      operation,
      inputPaths: files.map((f) => f.path),
      outputPath,
      outputFilename,
      downloadName,
      options,
      sessionId: req.sessionId,
    });

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

// GET /api/jobs/:jobId -- check job status (session-scoped)
export const getJobStatus = (req, res, next) => {
  try {
    const job = queue.getJob(req.params.jobId);

    if (!job) {
      throw new NotFoundError('Job');
    }

    // Session isolation — users can only see their own jobs
    if (job.data.sessionId && job.data.sessionId !== req.sessionId) {
      throw new NotFoundError('Job');
    }

    const response = queue.formatJobForResponse(job);

    if (job.state === queue.JOB_STATES.COMPLETED) {
      response.downloadUrl = `/api/jobs/${job.id}/download?name=${encodeURIComponent(
        job.data.downloadName || job.data.outputFilename
      )}`;
    }

    res.json({ status: 'success', data: response });
  } catch (err) {
    next(err);
  }
};

// GET /api/jobs/:jobId/download -- download result (session-scoped)
export const downloadJobResult = (req, res, next) => {
  try {
    const job = queue.getJob(req.params.jobId);

    if (!job) {
      throw new NotFoundError('Job');
    }

    // Session isolation
    if (job.data.sessionId && job.data.sessionId !== req.sessionId) {
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

// GET /api/jobs -- queue statistics
export const getStats = (_req, res) => {
  const stats = queue.getQueueStats();
  res.json({ status: 'success', data: stats });
};
