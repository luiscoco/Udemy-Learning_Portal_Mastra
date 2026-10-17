import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production topology: the bundled API (`apps/api/dist/server.js`) serving the
 * built web app on one origin. No tsx wrapper and no Vite dev proxy are involved, so tests exercise
 * exactly what `npm run build && npm start` deploys.
 *
 * E2E_LIVE=1 runs only e2e/live/** against a server in MASTRA_MODE=live (real provider calls,
 * keys from the repo-root .env).
 */
const PORT = Number(process.env.E2E_PORT ?? 8797);
const LIVE = process.env.E2E_LIVE === '1';

export default defineConfig({
  testDir: './e2e',
  ...(LIVE ? { testMatch: ['live/**/*.spec.ts'] } : { testIgnore: ['live/**'] }),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Some labs run CPU-heavy work (e.g. the TypeScript compiler); keep parallelism modest.
  workers: LIVE ? 1 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: LIVE
    ? [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
      ],
  webServer: {
    command: 'npm run build && node apps/api/dist/server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      WEB_DIST_DIR: 'apps/web/dist',
      MAX_CONCURRENT_RUNS: '8',
      MASTRA_MODE: LIVE ? 'live' : 'offline',
    },
  },
});
