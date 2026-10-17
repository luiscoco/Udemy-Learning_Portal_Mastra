import type { LabFixture } from '../fixtures.js';
import { lab28Definition } from './definition.js';

const example = lab28Definition.exampleInput;
const merged = lab28Definition.expectedOutput.example.merged;

export const lab28Fixtures: LabFixture[] = [
  {
    name: 'swapped latency: completion order flips, merged record identical',
    input: { ...example, classifyLatencyMs: 500, summarizeLatencyMs: 300 },
    expect: { status: 'succeeded', validationPassed: true, output: { completionOrder: ['summarize', 'classify'], merged } },
  },
  {
    name: 'summarize fails: workflow failed, classify kept, no merge',
    input: { ...example, failingBranch: 'summarize' },
    expect: { status: 'succeeded', validationPassed: false, output: { status: 'failed', mergeRan: false, merged: null } },
  },
];
