import type { LabFixture } from '../fixtures.js';
import { lab57Definition } from './definition.js';
import { RUBRICS } from './rubrics.js';

const example = lab57Definition.exampleInput;

export const lab57Fixtures: LabFixture[] = [
  {
    name: 'reference answer: score 1',
    input: { ...example, answer: RUBRICS['workflow-steps']!.reference },
    expect: { status: 'succeeded', validationPassed: true, output: { scoreCard: { score: 1, passed: true } } },
  },
  {
    name: 'empty answer: not scorable, no score',
    input: { ...example, answer: '' },
    expect: { status: 'succeeded', validationPassed: true, output: { scoreCard: { score: null, passed: null } } },
  },
  {
    name: 'known-wrong claim: penalised and failed',
    input: { ...example, rubricId: 'suspend-resume', answer: 'The workflow waits in a polling loop until a human answers.' },
    expect: { status: 'succeeded', validationPassed: true, output: { scoreCard: { score: 0.05, passed: false } } },
  },
  {
    name: 'agent answer (offline): scored deterministically',
    input: { ...example, answerSource: 'agent' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { agent: { toolCalls: ['search_sources'] }, determinism: { identical: true } },
    },
  },
];
