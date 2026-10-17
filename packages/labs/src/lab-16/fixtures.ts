import type { LabFixture } from '../fixtures.js';

const question = 'My order ORD-2042 has not arrived yet. When will it come, and how much did I pay?';
const modelId = 'openai/gpt-5-mini';

export const lab16Fixtures: LabFixture[] = [
  {
    name: 'four locales in parallel',
    input: {
      question,
      profiles: [
        { persona: 'ava', tone: 'concise', locale: 'fr-FR' },
        { persona: 'lucia', tone: 'friendly', locale: 'es-ES' },
        { persona: 'kenji', tone: 'formal', locale: 'ja-JP' },
        { persona: 'max', tone: 'friendly', locale: 'de-DE' },
      ],
      strategy: 'request-context',
      modelId,
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        requests: [
          {
            persona: 'ava',
            answer: 'Votre commande ORD-2042 devrait arriver le 21 octobre 2026 ; le total est de 45,90\u00a0€. — Ava',
          },
          { persona: 'lucia' },
          { persona: 'kenji' },
          {
            persona: 'max',
            answer:
              'Hallo! Ihre Bestellung ORD-2042 sollte am 21. Oktober 2026 ankommen; der Gesamtbetrag beträgt 45,90\u00a0€. — Max',
          },
        ],
      },
    },
  },
  {
    name: 'shared module state leaks the last profile into every request',
    input: {
      question,
      profiles: [
        { persona: 'ava', tone: 'friendly', locale: 'en-US' },
        { persona: 'lucia', tone: 'formal', locale: 'es-ES' },
        { persona: 'kenji', tone: 'concise', locale: 'ja-JP' },
      ],
      strategy: 'shared-module-state',
      modelId,
    },
    expect: { status: 'succeeded', validationPassed: false },
  },
];
