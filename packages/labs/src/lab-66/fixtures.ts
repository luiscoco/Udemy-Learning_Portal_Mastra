import type { LabFixture } from '../fixtures.js';
import { lab66Definition } from './definition.js';

const base = lab66Definition.exampleInput;

export const lab66Fixtures: LabFixture[] = [
  {
    name: 'dropped stream resumes with Last-Event-ID',
    input: base,
    expect: { status: 'succeeded', validationPassed: true, output: { rendered: { status: 'succeeded' } } },
  },
  {
    name: 'snapshot drift becomes a CONTRACT error',
    input: { ...base, drift: 'snapshot', dropAfterEvents: 0 },
    expect: { status: 'succeeded', validationPassed: true, output: { rendered: { status: null } } },
  },
  {
    name: 'unknown event type stops the stream with CONTRACT',
    input: { ...base, drift: 'event', dropAfterEvents: 0 },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'cancel with the run token',
    input: { ...base, delayMs: 1_000, dropAfterEvents: 0, cancelAfterMs: 150 },
    expect: { status: 'succeeded', validationPassed: true, output: { rendered: { status: 'cancelled' } } },
  },
];
