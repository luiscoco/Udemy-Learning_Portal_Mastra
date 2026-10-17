import type { LabFixture } from '../fixtures.js';

const message = 'I was charged twice for my invoice this month, please refund. Contact: bob@example.org';

export const lab09Fixtures: LabFixture[] = [
  {
    name: 'fenced JSON is parsed',
    input: { message, modelId: 'openai/gpt-5-mini', errorStrategy: 'strict', offlineResponse: 'fenced' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { schemaValid: true, object: { category: 'billing', priority: 'high' } },
    },
  },
  {
    name: 'wrong shape + strict: error reported, no crash, no object',
    input: { message, modelId: 'openai/gpt-5-mini', errorStrategy: 'strict', offlineResponse: 'wrong-shape' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { object: null, error: { code: 'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED' } },
    },
  },
  {
    name: 'broken JSON + warn: no object, no throw',
    input: { message, modelId: 'openai/gpt-5-mini', errorStrategy: 'warn', offlineResponse: 'broken-json' },
    expect: { status: 'succeeded', validationPassed: true, output: { object: null, error: null } },
  },
  {
    name: 'wrong shape + fallback: fallback ticket returned',
    input: { message, modelId: 'openai/gpt-5-mini', errorStrategy: 'fallback', offlineResponse: 'wrong-shape' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { usedFallback: true, object: { title: 'Unclassified request' } },
    },
  },
];
