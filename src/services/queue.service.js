// THE JOB QUEUE SERVICE
//
// This is the most important module in the entire project.
// It's what makes the difference between "server crashes under load"
// and "server handles 1000 users gracefully."
//
// ═══════════════════════════════════════════════════════════════
// HOW A JOB QUEUE WORKS (the concept):
// ═══════════════════════════════════════════════════════════════
//
// Without a queue:
//   Request comes in → Process immediately → Response when done
//   Problem: if processing takes 30s, the user waits 30s. If 10 users
//   hit at once, the server runs 10 heavy tasks simultaneously and crashes.
//
// With a queue:
//   Request comes in → Add job to a list → Respond IMMEDIATELY with jobId
//   A "worker" runs in the background, picking jobs off the list one at a time.
//   The user polls "is my job done yet?" with the jobId.
//
// ═══════════════════════════════════════════════════════════════
// JOB STATE MACHINE:
// ═══════════════════════════════════════════════════════════════
//
//   ┌─────────┐    worker picks it up    ┌────────────┐
//   │ queued  │ ───────────────────────→ │ processing │
//   └─────────┘                          └────────────┘
//       ↑                                   │       │
//       │ retry                      success │       │ failure
//       │                                    ↓       ↓
//       │                            ┌───────────┐ ┌────────┐
//       └────────────────────────────│ completed │ │ failed │
//            (if retries left)       └───────────┘ └────────┘
//
// Each job has: id, state, data (what to do), result (output), error, timestamps.
//
// ═══════════════════════════════════════════════════════════════
// WHY BUILD IT FROM SCRATCH?
// ═══════════════════════════════════════════════════════════════
//
// In production you'd use BullMQ + Redis. But building it yourself teaches:
//   1. How state machines work
//   2. How concurrency control works
//   3. How workers pick up and process jobs
//   4. How retry logic works
//
// And because we expose the SAME INTERFACE (addJob, getJob, etc.),
// swapping to BullMQ later = change this ONE file.

import crypto from 'node:crypto';
import { queueConfig } from '../config/index.js';
import logger from '../utils/logger.js';

// ── The job store ──────────────────────────────────────────────
// In-memory Map. In production, this would be Redis.
// Map gives O(1) lookups by jobId.
const jobs = new Map();

// ── Job states (enum-like constants) ───────────────────────────
export const JOB_STATES = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// ── Create a new job ───────────────────────────────────────────
// Called by the controller when a user submits a PDF operation.
// Returns IMMEDIATELY with a jobId. The actual work happens later.
export const addJob = (jobData) => {
  const jobId = crypto.randomUUID();

  const job = {
    id: jobId,
    state: JOB_STATES.QUEUED,
    data: jobData,           // { operation, inputPaths, outputPath, options }
    result: null,            // filled when completed
    error: null,             // filled when failed
    attempts: 0,
    maxRetries: queueConfig.maxRetries,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };

  jobs.set(jobId, job);
  logger.info(`Job ${jobId} added to queue`, { operation: jobData.operation });
  return job;
};

// ── Get a job by ID ────────────────────────────────────────────
// Used by the controller to respond to "is my job done?" polls.
export const getJob = (jobId) => {
  return jobs.get(jobId) || null;
};

// ── Get the next queued job ────────────────────────────────────
// The worker calls this repeatedly to find work.
// Returns the OLDEST queued job (FIFO -- First In, First Out).
export const getNextQueuedJob = () => {
  for (const job of jobs.values()) {
    if (job.state === JOB_STATES.QUEUED) {
      return job;
    }
  }
  return null;
};

// ── Count jobs currently being processed ───────────────────────
// Used by the worker to enforce concurrency limits.
export const getActiveJobCount = () => {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.state === JOB_STATES.PROCESSING) count++;
  }
  return count;
};

// ── Transition: queued → processing ────────────────────────────
export const markProcessing = (jobId) => {
  const job = jobs.get(jobId);
  if (!job) return;
  job.state = JOB_STATES.PROCESSING;
  job.startedAt = Date.now();
  job.attempts += 1;
  logger.info(`Job ${jobId} started processing (attempt ${job.attempts})`);
};

// ── Transition: processing → completed ─────────────────────────
export const markCompleted = (jobId, result) => {
  const job = jobs.get(jobId);
  if (!job) return;
  job.state = JOB_STATES.COMPLETED;
  job.result = result;
  job.completedAt = Date.now();
  const duration = job.completedAt - job.startedAt;
  logger.info(`Job ${jobId} completed in ${duration}ms`);
};

// ── Transition: processing → failed (or back to queued for retry) ──
export const markFailed = (jobId, error) => {
  const job = jobs.get(jobId);
  if (!job) return;

  if (job.state === JOB_STATES.CANCELLED) return;

  if (job.attempts < job.maxRetries) {
    job.state = JOB_STATES.QUEUED;
    job.error = error;
    logger.warn(`Job ${jobId} failed (attempt ${job.attempts}/${job.maxRetries}), will retry`, {
      error,
    });
  } else {
    job.state = JOB_STATES.FAILED;
    job.error = error;
    job.completedAt = Date.now();
    logger.error(`Job ${jobId} permanently failed after ${job.attempts} attempt(s)`, {
      error,
    });
  }
};

// ── Transition: queued|processing → cancelled ───────────────────
export const markCancelled = (jobId) => {
  const job = jobs.get(jobId);
  if (!job) return false;

  if (job.state === JOB_STATES.COMPLETED || job.state === JOB_STATES.CANCELLED) {
    return false;
  }

  const previousState = job.state;
  job.state = JOB_STATES.CANCELLED;
  job.completedAt = Date.now();
  job.error = 'Cancelled by user';
  logger.info(`Job ${jobId} cancelled (was ${previousState})`);
  return true;
};

// ── Check if a job has been cancelled ───────────────────────────
export const isJobCancelled = (jobId) => {
  const job = jobs.get(jobId);
  return job?.state === JOB_STATES.CANCELLED;
};

// ── Get queue statistics ───────────────────────────────────────
// Useful for monitoring and debugging.
export const getQueueStats = () => {
  const stats = { queued: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
  for (const job of jobs.values()) {
    stats[job.state]++;
    stats.total++;
  }
  return stats;
};

// ── Cleanup old completed/failed jobs ──────────────────────────
// Runs periodically to prevent memory from growing forever.
// This is the "garbage collector" for jobs.
export const cleanupOldJobs = () => {
  const now = Date.now();
  let cleaned = 0;

  for (const [jobId, job] of jobs.entries()) {
    const isFinished = job.state === JOB_STATES.COMPLETED || job.state === JOB_STATES.FAILED || job.state === JOB_STATES.CANCELLED;
    const isOld = (now - job.createdAt) > queueConfig.jobTTL;

    if (isFinished && isOld) {
      jobs.delete(jobId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old job(s)`);
  }
};

// ── Format a job for API responses ─────────────────────────────
// Strips internal fields and adds computed fields like duration.
// This is the "presentation" layer for job data.
export const formatJobForResponse = (job) => {
  const response = {
    id: job.id,
    state: job.state,
    operation: job.data.operation,
    downloadName: job.data.downloadName,
    createdAt: new Date(job.createdAt).toISOString(),
    attempts: job.attempts,
  };

  if (job.startedAt) {
    response.startedAt = new Date(job.startedAt).toISOString();
  }

  if (job.completedAt) {
    response.completedAt = new Date(job.completedAt).toISOString();
    response.duration = `${job.completedAt - job.startedAt}ms`;
  }

  if (job.state === JOB_STATES.COMPLETED && job.result) {
    response.result = job.result;
  }

  if ((job.state === JOB_STATES.FAILED || job.state === JOB_STATES.CANCELLED) && job.error) {
    response.error = job.error;
  }

  return response;
};
