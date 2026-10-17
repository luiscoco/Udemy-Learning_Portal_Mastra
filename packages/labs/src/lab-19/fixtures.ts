import type { LabFixture } from '../fixtures.js';

const prompt =
  'Plan a three-stop walk in Lisbon: Alfama, Belém Tower and LX Factory. Look up each stop with lookupPlace, then write the plan.';

export const lab19Fixtures: LabFixture[] = [
  {
    name: 'too few steps: the loop ends without a plan',
    input: {
      prompt,
      modelId: 'openai/gpt-5-mini',
      reasoningEffort: 'low',
      maxOutputTokens: 1500,
      maxSteps: 2,
      stepTimeoutMs: 20000,
    },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        stepsUsed: 2,
        finishReason: 'tool-calls',
        limitsHit: ['maxSteps'],
        lookups: ['Alfama', 'Belém Tower'],
        answer: '',
      },
    },
  },
  {
    name: 'too few output tokens: finish reason length',
    input: {
      prompt,
      modelId: 'openai/gpt-5-mini',
      reasoningEffort: 'minimal',
      maxOutputTokens: 64,
      maxSteps: 4,
      stepTimeoutMs: 20000,
    },
    expect: { status: 'succeeded', validationPassed: false, output: { finishReason: 'length', limitsHit: ['maxOutputTokens'] } },
  },
  {
    name: 'temperature applied on a model that supports it',
    input: {
      prompt,
      modelId: 'anthropic/claude-haiku-4-5',
      temperature: '0.3',
      maxOutputTokens: 1500,
      maxSteps: 4,
      stepTimeoutMs: 20000,
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        effective: {
          modelSettings: { temperature: 0.3 },
          omitted: [
            { option: 'reasoningEffort', reason: 'anthropic/claude-haiku-4-5 has no reasoning-effort control' },
            { option: 'reasoning (budget_tokens)', reason: 'available for this model but not exposed in this lab' },
          ],
        },
        modelSaw: Array.from({ length: 4 }, () => ({ temperature: 0.3, maxOutputTokens: 1500 })),
      },
    },
  },
];
