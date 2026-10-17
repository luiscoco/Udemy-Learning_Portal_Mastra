import type { LabFixture } from '../fixtures.js';

const base = {
  cities: ['Madrid', 'London'],
  dataSource: 'mock',
  timeoutMs: 3000,
  maxRequestsPerMinute: 5,
  modelId: 'openai/gpt-5-mini',
};

export const lab14Fixtures: LabFixture[] = [
  {
    name: 'timeout is enforced and reported',
    input: { ...base, mockFault: 'timeout', timeoutMs: 300 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        results: [
          { ok: false, code: 'TIMEOUT' },
          { ok: false, code: 'TIMEOUT' },
        ],
      },
    },
  },
  {
    name: 'upstream 429 is a retryable typed error',
    input: { ...base, mockFault: 'rate-limited' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        results: [
          { ok: false, code: 'RATE_LIMITED', retryAfterSeconds: 30 },
          { ok: false, code: 'RATE_LIMITED' },
        ],
      },
    },
  },
  {
    name: 'upstream 503 is handled',
    input: { ...base, mockFault: 'server-error' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { results: [{ ok: false, code: 'UPSTREAM_ERROR', retryable: true }, { ok: false }] },
    },
  },
  {
    name: 'broken JSON is caught by the schema',
    input: { ...base, mockFault: 'bad-json' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        results: [
          { ok: false, code: 'BAD_RESPONSE' },
          { ok: false, code: 'BAD_RESPONSE' },
        ],
      },
    },
  },
  {
    name: 'client rate limit refuses extra requests without calling the API',
    input: { ...base, cities: ['Madrid', 'Lisbon', 'Tokyo'], mockFault: 'none', maxRequestsPerMinute: 1 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        results: [
          { ok: true, city: 'Madrid' },
          { ok: false, code: 'RATE_LIMITED' },
          { ok: false, code: 'RATE_LIMITED' },
        ],
      },
    },
  },
];
