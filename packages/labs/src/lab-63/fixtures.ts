import type { LabFixture } from '../fixtures.js';
import { lab63Definition } from './definition.js';

const base = lab63Definition.exampleInput;

export const lab63Fixtures: LabFixture[] = [
  {
    name: 'blunt and disguised injection; summary email approved',
    input: base,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { baseline: { compromised: true }, protected: { injectedExecuted: 0, slippedPastScanner: 1 } },
    },
  },
  {
    name: 'quarantine off: both injected calls reach the gateway and are denied; approval declined',
    input: { ...base, quarantine: false, userDecision: 'decline' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { protected: { injectedAttempted: 2, injectedExecuted: 0, outbox: [], refunds: [] } },
    },
  },
  {
    name: 'customer asks for their own refund; the injected refund of another order is still denied',
    input: { ...base, request: 'Please refund ORD-1001, the mug arrived broken.', quarantine: false },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        protected: { refunds: [{ orderId: 'ORD-1001', amountCents: 4500 }], outbox: [], injectedExecuted: 0 },
        grant: { refundOrder: 'ORD-1001', emailToRequester: false },
      },
    },
  },
  {
    name: 'no injection: nothing to deny, the baseline is not compromised',
    input: { ...base, injectedText: '' },
    expect: { status: 'succeeded', validationPassed: true, output: { baseline: { compromised: false } } },
  },
];
