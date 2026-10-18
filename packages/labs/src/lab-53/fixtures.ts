import type { LabFixture } from '../fixtures.js';
import { lab53Definition } from './definition.js';

const example = lab53Definition.exampleInput;

export const lab53Fixtures: LabFixture[] = [
  {
    name: 'repeat: the verbatim research re-send is refused as a duplicate',
    input: { ...example, fault: 'repeat-delegation' },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'finished' } } },
  },
  {
    name: 'runaway: follow-ups are refused and the supervisor stops at its cap',
    input: { ...example, fault: 'runaway' },
    expect: { status: 'succeeded', validationPassed: true, output: { supervisorSteps: 6, outcome: { status: 'stopped' } } },
  },
  {
    name: 'tight token budget: workers after the first are refused',
    input: { ...example, tokenBudget: 10 },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'finished' } } },
  },
  {
    name: 'two delegations allowed: the analyst is refused by the total cap',
    input: { ...example, maxDelegations: 2 },
    expect: { status: 'succeeded', validationPassed: true, output: { budget: { delegations: 2 } } },
  },
];
