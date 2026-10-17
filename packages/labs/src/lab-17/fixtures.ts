import type { LabFixture } from '../fixtures.js';

const modelId = 'openai/gpt-5-mini';

export const lab17Fixtures: LabFixture[] = [
  {
    name: 'no headers: defaults apply and no injection',
    input: {
      message: 'Show my paid invoices, please.',
      authClaims: { tenantId: 'globex', userId: 'u-2002', plan: 'enterprise' },
      clientHeaders: {},
      modelId,
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        context: { tenantId: 'globex', locale: 'en-US', requestId: 'req-0000' },
        defaulted: ['locale', 'requestId'],
        rejected: [],
      },
    },
  },
  {
    name: 'extra claim and invalid header value are rejected',
    input: {
      message: 'Show my open invoices.',
      authClaims: { tenantId: 'acme', userId: 'u-1001', plan: 'free', role: 'admin' },
      clientHeaders: { 'x-locale': 'pt-BR', __mastra_channel: 'x' },
      modelId,
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        context: { locale: 'en-US' },
        rejected: [
          { source: 'claims', key: 'role', reason: 'not on the allowlist' },
          { source: 'headers', key: 'x-locale', reason: 'invalid value' },
          { source: 'headers', key: '__mastra_channel', reason: 'reserved Mastra key' },
        ],
      },
    },
  },
  {
    name: 'invalid verified claims fail closed',
    input: {
      message: 'Show my open invoices.',
      authClaims: { tenantId: 'Acme Corp!', userId: 'u-1001', plan: 'pro' },
      clientHeaders: {},
      modelId,
    },
    expect: { status: 'failed', errorCode: 'VALIDATION_FAILED' },
  },
];
