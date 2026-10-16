import type { LabFixture } from '../fixtures.js';

export const lab02Fixtures: LabFixture[] = [
  {
    name: 'UI mapped to the API folder fails only the UI check',
    input: {
      ui: 'apps/api',
      api: 'apps/api',
      runtime: 'packages/mastra-runtime',
      mastraEntry: 'packages/labs/src/lab-01/template/src/mastra/index.ts',
    },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: { env: { dotenvGitignored: true, clientEnvPrefix: 'VITE_PUBLIC_' } },
    },
  },
  {
    name: 'React entry file is not the Mastra entry point',
    input: { ui: 'apps/web', api: 'apps/api', runtime: 'packages/mastra-runtime', mastraEntry: 'apps/web/src/main.tsx' },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
