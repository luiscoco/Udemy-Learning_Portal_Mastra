import { resolve } from 'node:path';
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
const authFile = resolve('e2e/.auth/learner.json');
const progressTag = Date.now().toString(36);
const progressAccounts = Object.fromEntries(
  ['desktop', 'mobile'].map((project) => [
    project,
    Object.fromEntries(
      [
        'fresh',
        'workspace',
        'cross',
        'offline',
        'conflict',
        'migration',
        'alice',
        'bob',
        'visual',
        'format-stream',
        'format-checkpoint',
        'tutor',
        'tutor-live',
        'tutor-lifecycle',
        'visual-guides',
        'visual-guides-state',
        'visual-guides-export',
      ].map((kind) => [kind, `p-${project}-${kind}-${progressTag}`]),
    ),
  ]),
);

export default defineConfig({
  metadata: { progressAccounts },
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
    ? [
        { name: 'setup', testMatch: /auth\.setup\.ts/ },
        { name: 'desktop', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: authFile } },
      ]
    : [
        { name: 'setup', testMatch: /auth\.setup\.ts/ },
        { name: 'desktop', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: authFile } },
        { name: 'mobile', dependencies: ['setup'], use: { ...devices['Pixel 7'], storageState: authFile } },
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
      // The broad catalog suite deliberately starts many runs; dedicated limit tests use a separate low-limit API.
      RUN_START_RATE_USER_MAX: '10000',
      RUN_START_RATE_IP_MAX: '10000',
      RUN_CONTROL_RATE_USER_MAX: '10000',
      RUN_CONTROL_RATE_IP_MAX: '10000',
      MASTRA_MODE: LIVE ? 'live' : 'offline',
      AUTH_PROVIDER: 'dev',
      AUTH_DEV_USERS: [
        'learner',
        'alice',
        'bob',
        ...Object.values(progressAccounts).flatMap((accounts) => Object.values(accounts)),
      ].join(','),
      AUTH_DEV_PASSWORD: '',
      AUTH_SESSION_SECRET: '',
      AUTH_LOGIN_RATE_MAX: '1000',
      // E2E runs write memory databases and the document library: keep them away from learner data.
      MLP_DATA_DIR: resolve('.data', 'e2e'),
    },
  },
});
