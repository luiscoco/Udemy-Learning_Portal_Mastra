import type { LabFixture } from '../fixtures.js';
import { lab56Definition } from './definition.js';

const example = lab56Definition.exampleInput;

export const lab56Fixtures: LabFixture[] = [
  {
    name: 'tool error: recorded on the tool span, the run succeeds',
    input: { ...example, fault: 'tool-error' },
    expect: { status: 'succeeded', validationPassed: true, output: { workflowStatus: 'success' } },
  },
  {
    name: 'detached agent: the untraced review is detected',
    input: { ...example, fault: 'detached-agent' },
    expect: { status: 'succeeded', validationPassed: true, output: { workflowStatus: 'success' } },
  },
  {
    name: 'full view: every span, still coherent',
    input: { ...example, view: 'full' },
    expect: { status: 'succeeded', validationPassed: true, output: { traceTree: { view: 'full', hiddenSpans: 0 } } },
  },
];
