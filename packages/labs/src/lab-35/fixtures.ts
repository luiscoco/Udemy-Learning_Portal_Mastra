import type { LabFixture } from '../fixtures.js';
import { lab35Definition } from './definition.js';

const example = lab35Definition.exampleInput;
const [, c102, c103] = example.cases;

export const lab35Fixtures: LabFixture[] = [
  {
    name: 'controls disabled: the self-approval is accepted',
    input: { ...example, controls: 'disabled', cases: [{ ...c102!, expectBranch: 'approved' }] },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'high risk with only a manager attempt: still waiting, nothing decided',
    input: { ...example, cases: [{ ...c103!, reviewAttempts: [c103!.reviewAttempts[0]!], expectBranch: 'rejected' }] },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'three refused attempts: pending-review, nothing approved',
    input: {
      ...example,
      cases: [{ ...c102!, reviewAttempts: [c102!.reviewAttempts[0]!, c102!.reviewAttempts[0]!, c102!.reviewAttempts[0]!], expectBranch: 'pending-review' }],
    },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
