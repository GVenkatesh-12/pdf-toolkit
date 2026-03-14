// Middleware is a FUNCTION that sits between the request and the route handler.
// Express calls middleware in ORDER -- first registered, first executed.
//
// The signature is always: (req, res, next) => { ... }
//   - req: the incoming request
//   - res: the outgoing response
//   - next: call this to pass control to the NEXT middleware/route
//
// If you don't call next(), the request HANGS forever.

import logger from '../utils/logger.js';

const requestLogger = (req, res, next) => {
  const start = Date.now();

  // This runs AFTER the response is sent (the 'finish' event)
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
};

export default requestLogger;
