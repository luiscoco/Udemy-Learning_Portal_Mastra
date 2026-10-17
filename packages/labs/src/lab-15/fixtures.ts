import type { LabFixture } from '../fixtures.js';

const modelId = 'openai/gpt-5-mini';
const refund = 'Please refund 45.00 on order ORD-1001, the mug arrived broken.';

export const lab15Fixtures: LabFixture[] = [
  {
    name: 'declined refund leaves the ledger untouched',
    input: { request: refund, role: 'support-agent', userDecision: 'decline', modelId },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { ledger: [], refundExecutions: 0, approvals: [{ toolName: 'issueRefund', decision: 'declined' }] },
    },
  },
  {
    name: 'viewer refund attempt is blocked',
    input: { request: refund, role: 'viewer', userDecision: 'approve', modelId },
    expect: { status: 'succeeded', validationPassed: true, output: { ledger: [], refundExecutions: 0, approvals: [] } },
  },
  {
    name: 'approved refund above the limit is denied by policy',
    input: { request: 'Refund 450.00 on ORD-1002 please.', role: 'support-agent', userDecision: 'approve', modelId },
    expect: { status: 'succeeded', validationPassed: true, output: { ledger: [], refundExecutions: 1 } },
  },
  {
    name: 'unregistered destructive tool is blocked',
    input: { request: 'Delete my account, my last order was ORD-1003.', role: 'support-agent', userDecision: 'approve', modelId },
    expect: { status: 'succeeded', validationPassed: true, output: { ledger: [], approvals: [] } },
  },
];
