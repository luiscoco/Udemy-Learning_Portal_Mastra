import type { LabFixture } from '../fixtures.js';
import { lab74Definition } from './definition.js';

const base = lab74Definition.exampleInput;

export const lab74Fixtures: LabFixture[] = [
  { name: 'injected eval regression fails only its gate', input: base, expect: { status: 'succeeded', validationPassed: true } },
  {
    name: 'nothing injected: every gate passes on the recorded evidence',
    input: { ...base, inject: 'none' },
    expect: { status: 'succeeded', validationPassed: true, output: { injected: null } },
  },
  {
    name: 'injected accessibility regression',
    input: { ...base, inject: 'accessibility', measureFresh: false },
    expect: { status: 'succeeded', validationPassed: true, output: { injected: 'accessibility' } },
  },
];
