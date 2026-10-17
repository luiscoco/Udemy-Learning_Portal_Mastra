import type { LabFixture } from '../fixtures.js';

const common = { request: 'Please help with my order.', modelId: 'openai/gpt-5-mini' };

export const lab12Fixtures: LabFixture[] = [
  {
    name: 'valid refund executes once and returns a typed ticket',
    input: { ...common, toolArgs: { action: 'refund', orderId: 'ORD-123456', amountCents: 2500, reason: 'damaged' } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { argsValid: true, executeCalls: 1, toolOutput: { status: 'accepted', ticketId: 'TCK-3456', action: 'refund' } },
    },
  },
  {
    name: 'valid exchange executes once',
    input: { ...common, toolArgs: { action: 'exchange', orderId: 'ORD-000123', sku: 'TSH-0042', size: 'M' } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { argsValid: true, executeCalls: 1, toolOutput: { action: 'exchange' } },
    },
  },
  {
    name: 'exchange missing sku and size is rejected without executing',
    input: { ...common, toolArgs: { action: 'exchange', orderId: 'ORD-000123', amountCents: 100 } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { argsValid: false, executeCalls: 0, fieldErrors: [{ path: 'sku' }, { path: 'size' }] },
    },
  },
  {
    name: 'unknown action is rejected',
    input: { ...common, toolArgs: { action: 'delete', orderId: 'ORD-000123' } },
    expect: { status: 'succeeded', validationPassed: true, output: { argsValid: false, executeCalls: 0 } },
  },
];
