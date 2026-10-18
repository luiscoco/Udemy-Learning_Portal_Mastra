import type { LabFixture } from '../fixtures.js';
import { lab40Definition } from './definition.js';

const example = lab40Definition.exampleInput;

export const lab40Fixtures: LabFixture[] = [
  {
    name: 'overconfident model, guard on: the invented discount is blocked',
    input: { ...example, offlineBehaviour: 'overconfident' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'overconfident model, guard off: the invented discount is shown',
    input: { ...example, offlineBehaviour: 'overconfident', guard: 'off' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'a very high support threshold turns every answer into an honest refusal',
    input: { ...example, minScore: 0.95, questions: [{ question: 'Do you offer a student discount?', expect: 'unsupported' }] },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
