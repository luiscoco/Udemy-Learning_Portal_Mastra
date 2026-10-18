import type { LabFixture } from '../fixtures.js';
import { lab49Definition } from './definition.js';

const example = lab49Definition.exampleInput;
const refund = { toolName: 'issue_refund', args: { orderId: 'ORD-1001', amountCents: 100, reason: 'test' } };

export const lab49Fixtures: LabFixture[] = [
  {
    name: 'side-effect tool: unknown to the server, never executed',
    input: { ...example, ...refund },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { status: 'rejected', reason: 'unknown-tool' } }, audit: [], refundExecutions: 0 },
    },
  },
  {
    name: 'side-effect tool allowlisted: still refused',
    input: { ...example, ...refund, expose: [...example.expose, 'issue_refund'] },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { reason: 'unknown-tool' } }, refundExecutions: 0 },
    },
  },
  {
    name: 'invalid arguments: rejected by the server with field errors',
    input: { ...example, args: { amountCents: -5, currency: 'EUR' } },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { reason: 'invalid-arguments', fieldErrors: [{ field: 'amountCents' }] } }, audit: [] },
    },
  },
  {
    name: 'order total from lab 11 over MCP',
    input: {
      ...example,
      toolName: 'calculate_order_total',
      args: { items: [{ name: 'Mug', unitPriceCents: 1250, quantity: 2 }], taxRatePct: 10 },
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { mcpCatalog: { call: { status: 'success', result: { subtotalCents: 2500, taxCents: 250, totalCents: 2750 } } } },
    },
  },
];
