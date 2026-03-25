const queueConfig = {
  // How many jobs can run AT THE SAME TIME.
  // Too low = slow throughput. Too high = server overwhelmed.
  // 2 is safe for most machines. A production server with 8 CPU cores might use 4-6.
  concurrency: 2,

  // If a job fails, retry it this many times before giving up.
  maxRetries: 2,

  // How often the worker checks for new jobs (in milliseconds).
  // 500ms = responsive without burning CPU.
  pollInterval: 500,

  // Auto-delete completed jobs after this many milliseconds (1 hour).
  // Prevents memory from growing forever.
  jobTTL: 60 * 60 * 1000,
};

export default queueConfig;
