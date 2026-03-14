// The GLOBAL error handler.
// Express recognizes error-handling middleware by its 4 parameters: (err, req, res, next).
// If ANY route or middleware calls next(err) or throws, Express skips
// all remaining middleware and jumps straight here.
//
// WHY is this powerful?
// Without this, every route would need its own try/catch and error response formatting.
// With this, routes just throw errors and this ONE function handles them all.
//
// This is functional programming's "error channel" -- errors flow through
// a separate pipeline from normal data.

import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

const errorHandler = (err, req, res, _next) => {
  // If it's one of our custom AppErrors, we know the status code
  if (err instanceof AppError) {
    logger.warn(`Operational error: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.originalUrl,
    });

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Unknown/unexpected error -- this is a BUG, log everything
  logger.error(`Unexpected error: ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
  });

  return res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
};

export default errorHandler;
