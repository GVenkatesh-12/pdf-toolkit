// A simple logger that wraps console methods.
// WHY not just use console.log directly?
// 1. If you later switch to a library like winston/pino, you change ONE file
// 2. You can add timestamps, log levels, formatting in ONE place
// 3. You can disable logs in tests by changing ONE place
//
// This is the "adapter pattern" -- wrapping a dependency so your app
// doesn't directly depend on it.

const logger = {
  info(message, data = {}) {
    console.log(`[INFO]  ${new Date().toISOString()} - ${message}`, data);
  },

  warn(message, data = {}) {
    console.warn(`[WARN]  ${new Date().toISOString()} - ${message}`, data);
  },

  error(message, data = {}) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, data);
  },

  debug(message, data = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, data);
    }
  },
};

export default logger;
