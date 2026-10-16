import type { LabFixture } from '../fixtures.js';

export const lab05Fixtures: LabFixture[] = [
  {
    name: 'local target with nothing listening completes with a helpful failed check',
    input: { target: 'local', studioUrl: 'http://127.0.0.1:65534', agentId: 'assistant-agent' },
    expect: { status: 'succeeded', validationPassed: false, output: { reachable: false, agent: null } },
  },
  {
    name: 'recorded target, unknown agent id',
    input: { target: 'recorded', studioUrl: 'http://localhost:4111', agentId: 'missing-agent' },
    expect: { status: 'succeeded', validationPassed: false, output: { reachable: true, agent: null } },
  },
];
