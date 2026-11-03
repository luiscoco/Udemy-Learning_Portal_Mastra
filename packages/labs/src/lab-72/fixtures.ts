import type { LabFixture } from '../fixtures.js';
import { lab72Definition } from './definition.js';

const base = lab72Definition.exampleInput;

export const lab72Fixtures: LabFixture[] = [
  {
    name: 'production configuration with mounted secrets',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { accepted: true, readiness: { status: 'ready' } } },
  },
  {
    name: 'missing session secret is refused by key',
    input: { ...base, mountSessionSecret: false },
    expect: { status: 'succeeded', validationPassed: false, output: { accepted: false } },
  },
  {
    name: 'read-only data directory makes readiness fail on data-dir only',
    input: { ...base, simulate: 'data-dir-read-only' },
    expect: { status: 'succeeded', validationPassed: true, output: { readiness: { status: 'not-ready' } } },
  },
];
