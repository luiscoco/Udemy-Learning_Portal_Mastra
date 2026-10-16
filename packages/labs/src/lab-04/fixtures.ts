import type { LabFixture } from '../fixtures.js';

export const lab04Fixtures: LabFixture[] = [
  {
    name: 'formal Spanish bullet instructions change both simulated answers',
    input: {
      modelId: 'google/gemini-2.5-flash',
      compareModelId: 'openai/gpt-4o-mini',
      instructions: 'Formal tone. Reply in Spanish using bullet points. Be concise.',
      prompt: 'Opening hours?',
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        primary: {
          text: '[simulated google/gemini-2.5-flash] Good day.\n- Sobre "Opening hours": aquí tienes una respuesta simulada.',
        },
        comparison: {
          text: '[simulated openai/gpt-4o-mini] Good day.\n- Sobre "Opening hours": aquí tienes una respuesta simulada.',
        },
        sameInputDelivered: true,
      },
    },
  },
];
