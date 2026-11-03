import type { LabFixture } from '../fixtures.js';
import { lab67Definition } from './definition.js';

const base = lab67Definition.exampleInput;

export const lab67Fixtures: LabFixture[] = [
  {
    name: 'send a message on a thread',
    input: { ...base, threadId: 'fixture-send' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'load history',
    input: { ...base, action: 'history', threadId: 'fixture-send' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'provider fails before any token: the turn is kept as failed',
    input: { ...base, threadId: 'fixture-fail', fault: 'fail' },
    expect: { status: 'succeeded', validationPassed: true, output: { chat: { turn: { status: 'failed' } } } },
  },
  {
    name: 'retry after the failure replaces the turn',
    input: { ...base, threadId: 'fixture-fail', retry: true },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
