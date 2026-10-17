import type { LabFixture } from '../fixtures.js';

export const lab07Fixtures: LabFixture[] = [
  {
    name: 'identical instructions complete but fail the "variants differ" check',
    input: {
      modelId: 'anthropic/claude-haiku-4-5',
      prompt: 'Hi',
      labelA: 'Same 1',
      instructionsA: 'You are a helpful assistant.',
      labelB: 'Same 2',
      instructionsB: 'You are a helpful assistant.',
    },
    expect: { status: 'succeeded', validationPassed: false, output: { outputsDiffer: false, identicalSettingsVerified: true } },
  },
];
