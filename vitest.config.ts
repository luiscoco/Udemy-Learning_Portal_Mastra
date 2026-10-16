import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          testTimeout: 30_000,
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
        },
      },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'web',
          testTimeout: 30_000,
          root: './apps/web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
});
