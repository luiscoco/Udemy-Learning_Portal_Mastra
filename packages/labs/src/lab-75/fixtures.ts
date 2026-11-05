import type { LabFixture } from '../fixtures.js';
import { lab75Definition } from './definition.js';
const base = lab75Definition.exampleInput;
export const lab75Fixtures: LabFixture[] = [
  {
    name: 'approved grounded request',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { quality: { score: 1 } } },
  },
  {
    name: 'declined approval',
    input: { ...base, approver: 'decline' },
    expect: { status: 'succeeded', validationPassed: true, output: { action: { status: 'declined', receipt: null } } },
  },
  {
    name: 'foreign case remains unavailable',
    input: { ...base, caseId: 'case-foreign' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { action: { status: 'blocked', receipt: null }, quality: { score: 0 } },
    },
  },
  {
    name: 'expired case blocked',
    input: { ...base, caseId: 'case-expired' },
    expect: { status: 'succeeded', validationPassed: true, output: { action: { status: 'blocked', receipt: null } } },
  },
  {
    name: 'amount exceeds case value',
    input: { ...base, amountCents: 30000 },
    expect: { status: 'succeeded', validationPassed: true, output: { action: { status: 'blocked' } } },
  },
  {
    name: 'invented citation blocks payment',
    input: { ...base, fault: 'bad-citation' },
    expect: { status: 'succeeded', validationPassed: true, output: { quality: { score: 0 }, action: { status: 'blocked' } } },
  },
  {
    name: 'no evidence blocks payment',
    input: { ...base, question: 'Explain quantum entanglement.' },
    expect: { status: 'succeeded', validationPassed: true, output: { quality: { score: 0 }, action: { status: 'blocked' } } },
  },
  {
    name: 'answer without payment',
    input: { ...base, action: 'answer' },
    expect: { status: 'succeeded', validationPassed: true, output: { action: { status: 'not-requested' } } },
  },
];
