import type { LabFixture } from '../fixtures.js';
import { lab52Definition } from './definition.js';

const example = lab52Definition.exampleInput;
export const TECHNICAL = 'The Reports export crashes with error E503 every time I try it. Customer C-2201.';
export const ACCOUNT = 'I am locked out after too many login attempts. Customer C-3300, my password is hunter2 if that helps.';

export const lab52Fixtures: LabFixture[] = [
  {
    name: 'technical request: resolved by the technical specialist',
    input: { ...example, message: TECHNICAL },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { visited: ['technical'], outcome: { status: 'resolved', resolver: 'technical' } },
    },
  },
  {
    name: 'account request: the password never reaches the specialist',
    input: { ...example, message: ACCOUNT },
    expect: { status: 'succeeded', validationPassed: true, output: { visited: ['account'], outcome: { resolver: 'account' } } },
  },
  {
    name: 'misroute: technical transfers the case and billing resolves it',
    input: { ...example, routingFault: 'misroute' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { visited: ['technical', 'billing'], outcome: { resolver: 'billing' } },
    },
  },
  {
    name: 'ping-pong: the cycle is refused and the case escalated',
    input: { ...example, routingFault: 'ping-pong' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { visited: ['billing', 'technical'], outcome: { status: 'escalated', escalation: { reason: 'cycle' } } },
    },
  },
  {
    name: 'ping-pong with one handoff allowed: the hop limit stops it',
    input: { ...example, routingFault: 'ping-pong', maxHops: 1 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { visited: ['billing'], outcome: { escalation: { reason: 'hop-limit' } } },
    },
  },
  {
    name: 'no customer id: the handoff is refused for missing context',
    input: { ...example, message: 'I was charged twice for order ORD-7781. Please refund one.' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { visited: [], outcome: { escalation: { reason: 'missing-context' } } },
    },
  },
];
