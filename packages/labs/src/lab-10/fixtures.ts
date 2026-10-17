import type { LabFixture } from '../fixtures.js';

const base = {
  prompt: 'Hello',
  modelId: 'openai/gpt-5-mini',
  maxAttempts: 4,
  baseDelayMs: 20,
  perAttemptTimeoutMs: 300,
  totalBudgetMs: 10000,
  idempotent: true,
};

export const lab10Fixtures: LabFixture[] = [
  {
    name: 'always 503: exactly maxAttempts attempts, then max-attempts',
    input: { ...base, scenario: 'always-unavailable' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { outcome: 'failed', stopReason: 'max-attempts', retries: 3 },
    },
  },
  {
    name: '400: one attempt, non-retryable',
    input: { ...base, scenario: 'bad-request' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { outcome: 'failed', stopReason: 'non-retryable', retries: 0 },
    },
  },
  {
    name: 'timeout then success: two attempts',
    input: { ...base, scenario: 'slow-then-success' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        outcome: 'succeeded',
        retries: 1,
        attempts: [
          { attempt: 1, timedOut: true, classification: 'retryable' },
          { attempt: 2, outcome: 'success' },
        ],
      },
    },
  },
  {
    name: 'Retry-After overrides the shorter exponential delay',
    input: { ...base, scenario: 'rate-limited-retry-after' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { outcome: 'succeeded', attempts: [{ statusCode: 429, waitMs: 600 }, { outcome: 'success' }] },
    },
  },
  {
    name: 'not idempotent: never retried',
    input: { ...base, scenario: 'transient-then-success', idempotent: false },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { outcome: 'failed', stopReason: 'not-idempotent', retries: 0 },
    },
  },
  {
    name: 'total budget stops retries early',
    input: { ...base, scenario: 'always-unavailable', baseDelayMs: 400, totalBudgetMs: 1000 },
    expect: { status: 'succeeded', validationPassed: true, output: { outcome: 'failed', stopReason: 'budget' } },
  },
];
