import type { LabFixture } from '../fixtures.js';
import { lab24Definition } from './definition.js';

const example = lab24Definition.exampleInput;

export const lab24Fixtures: LabFixture[] = [
  {
    name: 'stubbed vector service recalls the same fact',
    input: { ...example, vectorBackend: 'in-memory' },
    expect: { status: 'succeeded', validationPassed: true, output: { vectorBackend: 'in-memory', recalledFact: true } },
  },
  {
    name: 'recall disabled: no search, the fact is missing',
    input: { ...example, semanticRecall: false },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        questionQuery: null,
        recalledFact: false,
        answer: 'I don’t remember anything relevant from earlier conversations.',
      },
    },
  },
  {
    name: 'thread scope cannot see other conversations',
    input: { ...example, scope: 'thread' },
    expect: { status: 'succeeded', validationPassed: false, output: { recalledFact: false, questionQuery: { hits: [] } } },
  },
];
