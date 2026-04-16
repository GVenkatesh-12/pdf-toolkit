// The PDF Controller — session-scoped synchronous processing.
import path from 'node:path';
import { getOperation, listOperations } from '../services/pdf/index.js';
import { ValidationError } from '../utils/errors.js';
import { buildOperationDownloadName, generateUniqueFilename } from '../utils/fileHelpers.js';

// POST /api/pdf/:operation -- execute a PDF operation
export const processOperation = async (req, res, next) => {
  try {
    const { operation } = req.params;
    const operationConfig = getOperation(operation);
    const { handler, minFiles, maxFiles } = operationConfig;

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
    // Use session-scoped processed directory
    const outputDir = req.sessionProcessedDir;
    const outputPath = path.join(outputDir, outputFilename);

    const inputPaths = files.map((f) => f.path);

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
        downloadName,
        downloadUrl: `/api/pdf/download/${outputFilename}?name=${encodeURIComponent(downloadName)}`,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/pdf/operations
export const getOperations = (_req, res) => {
  res.json({
    status: 'success',
    data: { operations: listOperations() },
  });
};

// GET /api/pdf/download/:filename — session-scoped
export const downloadProcessed = (req, res, next) => {
  try {
    const filePath = path.join(req.sessionProcessedDir, req.params.filename);
    const downloadName = typeof req.query.name === 'string'
      ? path.basename(req.query.name)
      : req.params.filename;
    res.download(filePath, downloadName);
  } catch (err) {
    next(err);
  }
};
