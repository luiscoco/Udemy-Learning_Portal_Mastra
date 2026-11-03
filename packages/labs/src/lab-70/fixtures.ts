import type { LabFixture } from '../fixtures.js';
import { lab70Definition } from './definition.js';

const base = lab70Definition.exampleInput;

export const lab70Fixtures: LabFixture[] = [
  {
    name: 'seed the sample documents',
    input: { ...base, action: 'seed' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'ask about refunds',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { action: 'send', blocked: 0 } },
  },
  {
    name: 'load documents and history',
    input: { ...base, action: 'history' },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
