import type { LabFixture } from '../fixtures.js';
import { lab51Definition } from './definition.js';

const example = lab51Definition.exampleInput;

export const lab51Fixtures: LabFixture[] = [
  {
    name: 'uncited claim: caught by the first review and removed by one revision',
    input: { ...example, editorSlip: 'uncited-claim' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { revisions: 1, iterations: 2, final: { status: 'published', revisions: 1 } },
    },
  },
  {
    name: 'unsupported claim: the offline reviewer flags weak support',
    input: { ...example, editorSlip: 'unsupported-claim' },
    expect: { status: 'succeeded', validationPassed: true, output: { revisions: 1, final: { status: 'published' } } },
  },
  {
    name: 'no revisions allowed: an unknown citation goes to a human, nothing is published',
    input: { ...example, editorSlip: 'unknown-citation', maxRevisions: 0 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { revisions: 0, iterations: 1, final: { status: 'needs-human', text: '' } },
    },
  },
];
