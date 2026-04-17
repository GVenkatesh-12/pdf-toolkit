// THE PDF WORKER
//
// This is the "other side" of the job queue. The controller ADDS jobs,
// the worker PROCESSES them.
//
// ═══════════════════════════════════════════════════════════════
// HOW THE WORKER LOOP WORKS:
// ═══════════════════════════════════════════════════════════════
//
//   ┌──────────────────────────────┐
//   │  Is there a queued job AND   │  ← check every 500ms
//   │  am I below concurrency?     │
//   └──────────┬───────────────────┘
//              │
//        yes   │   no → sleep 500ms, loop again
//              ↓
//   ┌──────────────────────────────┐
//   │  Mark job as "processing"    │
//   │  Look up operation in        │
//   │  registry, call the handler  │
//   └──────────┬───────────────────┘
//              │
//       success│   failure
//              ↓       ↓
//   mark completed   mark failed (retry if attempts left)
//              │
//              └→ loop again
//
// CONCURRENCY CONTROL:
// If concurrency = 2, the worker will process at most 2 jobs simultaneously.
// When it checks "am I below concurrency?", it counts active jobs.
// This prevents the server from being overwhelmed.
//
// WHY IS THIS A SEPARATE FILE?
// Separation of concerns. The queue service manages job STATE.
// The worker manages job EXECUTION. Neither knows about HTTP.

import { queueConfig } from '../config/index.js';
import * as queue from '../services/queue.service.js';
import { getOperation } from '../services/pdf/index.js';
import logger from '../utils/logger.js';

let isRunning = false;
let pollTimer = null;
let cleanupTimer = null;

// Process a single job. This is where the actual PDF work happens.
const processJob = async (job) => {
  if (queue.isJobCancelled(job.id)) {
    logger.info(`Job ${job.id} was cancelled before processing started — skipping`);
    return;
  }

  const { operation, inputPaths, outputPath, options } = job.data;

  try {
    queue.markProcessing(job.id);

    const operationConfig = getOperation(operation);
    const { handler } = operationConfig;

    let result;
    if (inputPaths.length === 1) {
      result = await handler(inputPaths[0], outputPath, options);
    } else {
      result = await handler(inputPaths, outputPath, options);
    }

    if (queue.isJobCancelled(job.id)) {
      logger.info(`Job ${job.id} completed but was cancelled mid-flight — discarding result`);
      return;
    }

    queue.markCompleted(job.id, result);
  } catch (err) {
    if (queue.isJobCancelled(job.id)) {
      logger.info(`Job ${job.id} errored after cancellation — ignoring`);
      return;
    }
    queue.markFailed(job.id, err.message);
  }
};

// The main poll loop. Runs every pollInterval milliseconds.
const poll = () => {
  if (!isRunning) return;

  const activeCount = queue.getActiveJobCount();

  // Concurrency gate: only start new work if we're below the limit
  if (activeCount < queueConfig.concurrency) {
    const job = queue.getNextQueuedJob();
    if (job) {
      // Don't await -- fire and forget. This lets us process
      // multiple jobs concurrently. The job manages its own
      // state transitions (processing → completed/failed).
      processJob(job);
    }
  }

  // Schedule the next poll
  pollTimer = setTimeout(poll, queueConfig.pollInterval);
};

// ── Public API ─────────────────────────────────────────────────

export const startWorker = () => {
  if (isRunning) return;
  isRunning = true;

  logger.info('PDF worker started', {
    concurrency: queueConfig.concurrency,
    pollInterval: `${queueConfig.pollInterval}ms`,
  });

  // Start polling for jobs
  poll();

  // Start periodic cleanup of old completed/failed jobs
  cleanupTimer = setInterval(queue.cleanupOldJobs, queueConfig.jobTTL);
};

export const stopWorker = () => {
  isRunning = false;
  if (pollTimer) clearTimeout(pollTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  logger.info('PDF worker stopped');
};
