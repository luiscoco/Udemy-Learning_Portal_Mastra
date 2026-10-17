import type { LabFixture } from '../fixtures.js';
import { lab30Definition } from './definition.js';

const example = lab30Definition.exampleInput;
const one = example.documents[0]!;

export const lab30Fixtures: LabFixture[] = [
  {
    name: 'zero documents: empty batch, all checks pass',
    input: { ...example, documents: [] },
    expect: { status: 'succeeded', validationPassed: true, output: { report: { status: 'empty', total: 0 } } },
  },
  {
    name: 'one document: complete',
    input: { ...example, documents: [one] },
    expect: { status: 'succeeded', validationPassed: true, output: { report: { status: 'complete', total: 1 } } },
  },
  {
    name: 'throw mode: the workflow fails and every result is lost',
    input: { ...example, failureHandling: 'throw' },
    expect: { status: 'succeeded', validationPassed: false, output: { workflowStatus: 'failed', aggregateRan: false, report: null } },
  },
];
