import type { LabFixture } from '../fixtures.js';
import { lab64Definition } from './definition.js';

const base = lab64Definition.exampleInput;

export const lab64Fixtures: LabFixture[] = [
  {
    name: 'support agent: small refund allowed, two confirmed, account closure denied by default',
    input: base,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { counters: { issueRefund: 2, changeEmail: 1, closeAccount: 0 } },
    },
  },
  {
    name: 'self-approval refused without asking',
    input: { ...base, approver: 'self' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { counters: { issueRefund: 1, changeEmail: 0, closeAccount: 0 } },
    },
  },
  {
    name: 'supervisor with a manager closes the account after confirmation',
    input: { ...base, role: 'supervisor', approver: 'manager', request: 'Close account CUS-2001.' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { counters: { closeAccount: 1 }, sideEffects: { closed: ['CUS-2001'] } },
    },
  },
  {
    name: 'viewer: every write denied, lookup allowed',
    input: { ...base, role: 'viewer', request: 'Look up CUS-1042 and refund ORD-3001 €10.' },
    expect: { status: 'succeeded', validationPassed: true, output: { counters: { lookupAccount: 1, issueRefund: 0 } } },
  },
  {
    name: 'approver declines: nothing that needed confirmation ran',
    input: { ...base, userDecision: 'decline' },
    expect: { status: 'succeeded', validationPassed: true, output: { counters: { issueRefund: 1, changeEmail: 0 } } },
  },
];
