import type { LabFixture } from '../fixtures.js';

const base = { timeoutMs: 600, maxAttempts: 2 };

export const lab46Fixtures: LabFixture[] = [
  {
    name: 'nothing listening: classified unreachable and retried',
    input: { ...base, scenario: 'refused' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { connection: { status: 'failed', category: 'unreachable', retriable: true } },
    },
  },
  {
    name: 'wrong path: HTTP 404, not retried',
    input: { ...base, scenario: 'wrong-path' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { connection: { status: 'failed', category: 'not-found', httpStatus: 404 } },
    },
  },
  {
    name: 'silent server: timeout after each attempt',
    input: { ...base, scenario: 'timeout' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { connection: { category: 'timeout' }, teardown: { openSockets: 0 } },
    },
  },
  {
    name: 'legacy pin against a current-only server: protocol mismatch',
    input: { ...base, scenario: 'protocol-mismatch' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { connection: { category: 'protocol-mismatch', httpStatus: 400 } },
    },
  },
  {
    name: 'host not allowed: blocked before any request',
    input: { ...base, scenario: 'blocked-host' },
    expect: { status: 'succeeded', validationPassed: true, output: { connection: { category: 'blocked-by-policy' } } },
  },
];
