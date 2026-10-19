import type { LabFixture } from '../fixtures.js';
import { lab59Definition } from './definition.js';

const example = lab59Definition.exampleInput;

export const lab59Fixtures: LabFixture[] = [
  {
    name: 'no-tools as the baseline: the grounded configuration improves on it',
    input: { ...example, baseline: 'no-tools' },
    expect: { status: 'succeeded', validationPassed: true, output: { comparison: { baselineConfigId: 'no-tools' } } },
  },
  {
    name: 'two configurations only',
    input: { ...example, includeNoTools: false },
    expect: { status: 'succeeded', validationPassed: true, output: { selected: ['grounded', 'concise'] } },
  },
];
