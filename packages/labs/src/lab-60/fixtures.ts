import type { LabFixture } from '../fixtures.js';
import { lab60Definition } from './definition.js';

const example = lab60Definition.exampleInput;

export const lab60Fixtures: LabFixture[] = [
  {
    name: 'empty demo store: a usable empty state with no invented numbers',
    input: { ...example, store: 'empty-demo', action: 'show-only' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        recorded: null,
        dashboard: { empty: { isEmpty: true, reason: 'no-dataset' }, kpis: { runs: 0, latestPassRate: null } },
      },
    },
  },
  {
    name: 'a no-tools run is recorded and compared with the history',
    input: { ...example, configId: 'no-tools' },
    expect: { status: 'succeeded', validationPassed: true, output: { recorded: { configId: 'no-tools', items: 4 } } },
  },
];
