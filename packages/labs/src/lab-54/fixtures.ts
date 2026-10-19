import type { LabFixture } from '../fixtures.js';
import { lab54Definition } from './definition.js';

const example = lab54Definition.exampleInput;

export const lab54Fixtures: LabFixture[] = [
  {
    name: 'invalid extraction: caught by the boundary, retried, complete',
    input: { ...example, fault: 'invalid-extraction' },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'complete' } } },
  },
  {
    name: 'transient diagnosis outage: two retries, then complete',
    input: { ...example, fault: 'transient-diagnosis' },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'complete' } } },
  },
  {
    name: 'transient outage with one retry: degraded',
    input: { ...example, fault: 'transient-diagnosis', stepRetries: 1 },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'degraded', diagnosis: null } } },
  },
  {
    name: 'permanent diagnosis outage: degraded, the workflow still succeeds',
    input: { ...example, fault: 'permanent-diagnosis', repeatRuns: 1 },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'degraded' } } },
  },
  {
    name: 'extractor down: failed-safe, nothing published',
    input: { ...example, fault: 'extract-down', repeatRuns: 1 },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: { status: 'failed-safe', update: null } } },
  },
];
