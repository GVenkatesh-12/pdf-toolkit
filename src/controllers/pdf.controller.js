// The PDF Controller -- SYNCHRONOUS mode.
//
// This controller processes PDFs INLINE during the HTTP request.
// It's kept for convenience and quick testing, but for production
// use the JOB-BASED flow at /api/jobs instead.
//
// SYNC mode  (/api/pdf/:operation)  → blocks until done, returns result directly
// ASYNC mode (/api/jobs)            → returns jobId immediately, process in background

import path from 'node:path';
import { getOperation, listOperations } from '../services/pdf/index.js';
import { storageConfig } from '../config/index.js';
import { ValidationError } from '../utils/errors.js';
import { generateUniqueFilename } from '../utils/fileHelpers.js';

// POST /api/pdf/:operation -- execute a PDF operation
export const processOperation = async (req, res, next) => {
  try {
    const { operation } = req.params;
    const operationConfig = getOperation(operation);
    const { handler, minFiles, maxFiles } = operationConfig;

    // Get the uploaded files (multer puts them on req.files or req.file)
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

    // Build the output path in the "processed" directory
    const outputFilename = generateUniqueFilename(`${operation}-result.pdf`);
    const outputPath = path.join(storageConfig.processedDir, outputFilename);

    // Extract input paths from the multer file objects
    const inputPaths = files.map((f) => f.path);

    // Parse options from the request body (for operations like split)
    const options = {};
    if (req.body.start) options.start = parseInt(req.body.start, 10);
    if (req.body.end) options.end = parseInt(req.body.end, 10);

    // CALL THE HANDLER -- this is where the registry pattern shines.
    // We don't care whether it's merge, split, or compress.
    // We just call handler() and it does the right thing.
    let result;
    if (files.length === 1) {
      result = await handler(inputPaths[0], outputPath, options);
    } else {
      result = await handler(inputPaths, outputPath, options);
    }

    res.status(200).json({
      status: 'success',
      message: `Operation "${operation}" completed successfully`,
      data: {
        ...result,
        downloadUrl: `/api/pdf/download/${outputFilename}`,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/pdf/operations -- list all available operations
export const getOperations = (_req, res) => {
  res.json({
    status: 'success',
    data: { operations: listOperations() },
  });
};

// GET /api/pdf/download/:filename -- download a processed file
export const downloadProcessed = (req, res, next) => {
  try {
    const filePath = path.join(storageConfig.processedDir, req.params.filename);
    res.download(filePath, req.params.filename);
  } catch (err) {
    next(err);
  }
};
