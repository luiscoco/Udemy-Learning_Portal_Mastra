import type { LabFixture } from '../fixtures.js';

const modelId = 'openai/gpt-5-mini';
const messages = ["Hi, I'm Ana and I'm planning a trip to Porto.", 'I prefer trains to planes.'];
const followUp = "Remind me: what's my name and how do I like to travel?";

export const lab21Fixtures: LabFixture[] = [
  {
    name: 'lastMessages = 2 forgets the name',
    input: { threadId: 'fixture-window', messages, followUp, lastMessages: 2, resetThread: true, modelId },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        modelSawOnFollowUp: { priorMessages: 2, userMessages: ['I prefer trains to planes.'] },
        followUp: { answer: 'I don’t know your name yet, and you prefer trains. (I can see 1 earlier message(s) from you.)' },
      },
    },
  },
  {
    name: 'one message, no facts to remember',
    input: {
      threadId: 'fixture-plain',
      messages: ['Hello there.'],
      followUp: 'What do you remember?',
      lastMessages: 20,
      resetThread: true,
      modelId,
    },
    expect: { status: 'succeeded', validationPassed: false, output: { remembered: { name: null, preference: null } } },
  },
];
