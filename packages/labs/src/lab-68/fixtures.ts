import type { LabFixture } from '../fixtures.js';
import { lab68Definition } from './definition.js';

const base = { ...lab68Definition.exampleInput, stepDelayMs: 0 };

export const lab68Fixtures: LabFixture[] = [
  {
    name: 'auto-approve branch',
    input: base,
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { statuses: { autoApprove: 'success', managerReview: 'skipped' } },
    },
  },
  {
    name: 'manager review branch',
    input: { ...base, orderValue: 900 },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { statuses: { managerReview: 'success', autoApprove: 'skipped' } },
    },
  },
  {
    name: 'fraud check fails',
    input: { ...base, failStep: 'checkFraud' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: { statuses: { checkFraud: 'failed', decide: 'not-reached' } },
    },
  },
  {
    name: 'nested step fails',
    input: { ...base, failStep: 'bookCourier' },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'learner asks for a supervisor workflow',
    input: { ...base, workflowId: 'refund-override' },
    expect: { status: 'succeeded', validationPassed: true, output: { found: false, graph: null } },
  },
  {
    name: 'supervisor sees refund-override',
    input: { ...base, role: 'supervisor', workflowId: 'refund-override' },
    expect: { status: 'succeeded', validationPassed: true, output: { found: true } },
  },
];
