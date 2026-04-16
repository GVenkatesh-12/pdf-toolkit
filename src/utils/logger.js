const isProd = process.env.NODE_ENV === 'production';

function formatLog(level, message, data) {
  if (isProd) {
    return JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...data });
  }
  const prefix = `[${level.toUpperCase().padEnd(5)}] ${new Date().toISOString()} -`;
  return Object.keys(data).length ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
}

const logger = {
  info(message, data = {}) {
    console.log(formatLog('info', message, data));
  },

  warn(message, data = {}) {
    console.warn(formatLog('warn', message, data));
  },

  error(message, data = {}) {
    console.error(formatLog('error', message, data));
  },

  debug(message, data = {}) {
    if (!isProd) {
      console.debug(formatLog('debug', message, data));
    }
  },
};

export default logger;
