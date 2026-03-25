// Why a separate config file?
// When your app grows, you'll have dozens of settings. If they're scattered
// across files, changing one setting means hunting through the whole codebase.
// Centralizing config = change in one place, effect everywhere.

const serverConfig = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  isDev() {
    return this.nodeEnv === 'development';
  },
};

export default serverConfig;
