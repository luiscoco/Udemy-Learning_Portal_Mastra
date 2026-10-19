import type { LabFixture } from '../fixtures.js';
import { lab55Definition } from './definition.js';

const example = lab55Definition.exampleInput;

export const lab55Fixtures: LabFixture[] = [
  {
    name: 'rejected by the reviewer: nothing is published',
    input: { ...example, approver: 'reject' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { final: { status: 'rejected', text: '' }, citedAnswer: { fallback: true } },
    },
  },
  {
    name: 'uncited sentence: flagged by the workflow’s own check',
    input: { ...example, plantedClaim: 'uncited-claim' },
    expect: { status: 'succeeded', validationPassed: true, output: { final: { status: 'published' } } },
  },
  {
    name: 'unknown citation: flagged and withheld',
    input: { ...example, plantedClaim: 'unknown-citation' },
    expect: { status: 'succeeded', validationPassed: true, output: { final: { status: 'published' } } },
  },
  {
    name: 'no planted claim: every claim is supported and published',
    input: { ...example, plantedClaim: 'none' },
    expect: { status: 'succeeded', validationPassed: true, output: { citedAnswer: { blocked: [] } } },
  },
];
