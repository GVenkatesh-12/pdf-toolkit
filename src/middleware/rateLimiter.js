// Rate limiting middleware — prevents abuse and ensures fair usage.
//
// Without rate limiting, a single user (or bot) could:
//   1. Upload thousands of files per minute → fill the disk
//   2. Create thousands of jobs → crash the queue
//   3. DDoS the server with requests → make it unavailable for everyone
//
// We create separate limiters for different endpoint groups:
//   - General API: generous limit (100/min)
//   - Uploads: stricter (20/min)
//   - Job creation: moderate (15/min)

import rateLimit from 'express-rate-limit';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000; // 1 minute

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
});

// Upload-specific limiter — stricter because uploads are expensive
export const uploadLimiter = rateLimit({
  windowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many uploads. Please wait before uploading again.',
  },
});

// Job creation limiter
export const jobLimiter = rateLimit({
  windowMs,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many job requests. Please wait before submitting again.',
  },
});
