import type { LabFixture } from '../fixtures.js';
import { lab23Definition } from './definition.js';

export const lab23Fixtures: LabFixture[] = [
  {
    name: 'raw direct writes replace the profile with invalid data',
    input: { ...lab23Definition.exampleInput, validateDirectUpdates: false },
    expect: { status: 'succeeded', validationPassed: false, output: { stored: { homeAirport: 'lisbon' }, storedValid: false } },
  },
  {
    name: 'valid settings only, no conversation updates',
    input: {
      messages: ['Hello!'],
      settingsUpdates: [
        { name: 'Kenji', seat: 'aisle' },
        { homeAirport: 'NRT', dietary: ['halal'] },
      ],
      validateDirectUpdates: true,
      followUp: 'Book my next flight, please.',
      modelId: 'openai/gpt-5-mini',
    },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        stored: { name: 'Kenji', seat: 'aisle', homeAirport: 'NRT', dietary: ['halal'] },
        followUp: { answer: 'Flying from NRT: I’ll request a aisle seat and a halal meal, Kenji.' },
      },
    },
  },
];
