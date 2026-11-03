import type { LabFixture } from '../fixtures.js';
import { lab65Definition } from './definition.js';

const base = lab65Definition.exampleInput;

export const lab65Fixtures: LabFixture[] = [
  {
    name: 'primary outage, flaky tracker, recommendations down',
    input: base,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { breakers: { primary: { state: 'open' }, recommendations: { state: 'open' } } },
    },
  },
  {
    name: 'everything healthy: the primary answers, no breaker opens',
    input: { ...base, primaryFault: 'none', trackerFault: 'none', recommendationsFault: 'none' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { breakers: { primary: { state: 'closed' }, tracker: { state: 'closed' } } },
    },
  },
  {
    name: 'rejected key: never retried, fallback answers',
    input: { ...base, primaryFault: 'bad-key', trackerFault: 'none', recommendationsFault: 'none' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'slow tracker, question 1 abandoned mid-call',
    input: {
      ...base,
      primaryFault: 'none',
      trackerFault: 'slow',
      recommendationsFault: 'none',
      cancelQuestion: 1,
      toolTimeoutMs: 400,
    },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'slow primary model: timeouts, then the fallback',
    input: {
      ...base,
      primaryFault: 'slow',
      trackerFault: 'none',
      recommendationsFault: 'none',
      modelTimeoutMs: 300,
      questions: 'Where is my order ORD-5001?',
    },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
