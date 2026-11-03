import type { LabFixture } from '../fixtures.js';
import { lab69Definition } from './definition.js';

const base = lab69Definition.exampleInput;

export const lab69Fixtures: LabFixture[] = [
  {
    name: 'sample clip transcribed, answered and spoken',
    input: base,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { services: { stt: 'used', tts: 'used' }, fallback: { used: false } } },
    },
  },
  {
    name: 'misheard id is confirmed',
    input: { ...base, sample: 'misheard' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { identifiers: [{ normalized: 'ORD-5002', confirmed: false }] } },
    },
  },
  {
    name: 'speech-to-text down, typed message answered',
    input: { ...base, fault: 'stt-down', message: 'Where is ORD-5002?' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { services: { stt: 'failed' }, fallback: { used: true }, usedText: 'Where is ORD-5002?' } },
    },
  },
  {
    name: 'speech-to-text down, nothing typed: asks to type',
    input: { ...base, fault: 'stt-down' },
    expect: { status: 'succeeded', validationPassed: true, output: { voice: { needsText: true, answer: null } } },
  },
  {
    name: 'text-to-speech down: text reply',
    input: { ...base, fault: 'tts-down' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { services: { tts: 'failed' }, fallback: { used: true } } },
    },
  },
  {
    name: 'OpenAI voice requested offline: text fallback',
    input: { ...base, voice: 'openai', message: 'Where is ORD-5001?' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { services: { stt: 'unavailable', tts: 'unavailable' } } },
    },
  },
  {
    name: 'typed only, no audio',
    input: { ...base, audioSource: 'none', message: 'What can you do?', speakReply: false },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { voice: { source: 'text', services: { stt: 'not-needed', tts: 'not-requested' } } },
    },
  },
];
