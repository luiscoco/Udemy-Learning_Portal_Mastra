import { createApp } from './app.js';
import { ConfigError, describeConfig, loadDotEnv, parseConfig, secretValues } from './config.js';
import { createLogger } from './logger.js';

function main(): void {
  const envFile = loadDotEnv();
  let config;
  try {
    config = parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[config] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger(config.LOG_LEVEL, secretValues(config));
  const { app, runner } = createApp({ config, logger });
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info('api listening', {
      url: `http://${config.HOST}:${config.PORT}`,
      envFile: envFile ?? 'none',
      config: describeConfig(config),
    });
  });
  const shutdown = () => {
    logger.info('shutting down');
    void runner.dispose();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
