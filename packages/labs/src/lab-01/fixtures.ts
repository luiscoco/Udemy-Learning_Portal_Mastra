import type { LabFixture } from '../fixtures.js';

export const lab01Fixtures: LabFixture[] = [
  {
    name: 'Google trip planner builds and passes all checks',
    input: { projectName: 'trip-planner', provider: 'google', agentName: 'Trip Planner', moduleType: 'module' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        modelId: 'google/gemini-2.5-flash',
        agent: { variable: 'tripPlannerAgent', id: 'trip-planner-agent', file: 'src/mastra/agents/trip-planner-agent.ts' },
        build: { ok: true, diagnostics: [] },
      },
    },
  },
  {
    name: 'CommonJS builds but fails the ESM check',
    input: { projectName: 'cjs-app', provider: 'openai', agentName: 'Helper', moduleType: 'commonjs' },
    expect: { status: 'succeeded', validationPassed: false, output: { packageJson: { type: 'commonjs' } } },
  },
];
