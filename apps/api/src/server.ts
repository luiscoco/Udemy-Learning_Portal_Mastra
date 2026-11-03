import { createApp } from './app.js';
import { ConfigError, describeConfig, loadDeployConfig, loadDotEnv, secretValues } from './config.js';
import { createLogger } from './logger.js';

function main(): void {
  const envFile = loadDotEnv();
  let loaded;
  try {
    // Secrets from <KEY>_FILE, schema validation and production rules (L72). Messages name keys, never values.
    loaded = loadDeployConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[config] ${err.message}\n`);
      process.exit(78); // EX_CONFIG: a broken configuration is not fixed by restarting
    }
    throw err;
  }
  const { config } = loaded;
  // Mastra's model router and the lab services read provider keys (and the audit key) from process.env, so
  // secrets that came from <KEY>_FILE are made visible there too. They stay inside this server process.
  for (const [key, source] of Object.entries(loaded.sources))
    if (source === 'file') process.env[key] = config[key as keyof typeof loaded.sources];
  const logger = createLogger(config.LOG_LEVEL, secretValues(config));
  const { app, runner, readiness, drain } = createApp({ config, logger });
  for (const w of loaded.warnings) logger.warn('config warning', { key: w.key, message: w.message });
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info('api listening', {
      url: `http://${config.HOST}:${config.PORT}`,
      envFile: envFile ?? 'none',
      config: describeConfig(config),
      secretSources: loaded.sources,
    });
  });
  const shutdown = (signal: string) => {
    // warn level: an unexpected signal-driven exit must always be visible in the logs.
    logger.warn('shutting down', { signal, activeRuns: runner.activeCount });
    drain(); // readiness turns 503 first, so a load balancer stops routing here
    void runner.dispose();
    void readiness.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
  process.on('exit', (code) => logger.warn('process exit', { code }));
}

main();
