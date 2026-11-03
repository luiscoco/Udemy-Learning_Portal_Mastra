import type { LabFixture } from '../fixtures.js';
import { lab73Definition } from './definition.js';

const base = lab73Definition.exampleInput;

export const lab73Fixtures: LabFixture[] = [
  {
    name: 'healthy release',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { release: { released: true, downtimeS: 0 } } },
  },
  {
    name: 'missing secret: the gate holds and the release is rolled back',
    input: { ...base, scenario: 'missing-secret' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { release: { released: false, rolledBack: true, downtimeS: 0 } },
    },
  },
  {
    name: 'no readiness gate: learners hit the broken revision',
    input: { ...base, scenario: 'missing-secret', readinessGate: false },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
