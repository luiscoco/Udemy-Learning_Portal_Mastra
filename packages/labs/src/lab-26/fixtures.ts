import type { LabFixture } from '../fixtures.js';
import { lab26Definition } from './definition.js';

const example = lab26Definition.exampleInput;

export const lab26Fixtures: LabFixture[] = [
  {
    name: 'buggy step: Mastra reports success, the output check fails',
    input: { ...example, buggyStep: true },
    expect: {
      status: 'succeeded',
      validationPassed: false,
      output: {
        status: 'success',
        outputValid: false,
        outputIssues: [{ path: 'total' }],
        quote: null,
        rawResult: { total: '€63.00' },
      },
    },
  },
  {
    name: 'currency outside the workflow schema is rejected before any step',
    input: { ...example, currency: 'JPY' },
    expect: { status: 'succeeded', validationPassed: false, output: { status: 'rejected', stepExecutionPath: [], quote: null } },
  },
  {
    name: 'USD, tote bags and a T-shirt, no discount',
    input: { ...example, email: 'Hi, I would like 4 tote bags and one T-shirt please.', currency: 'USD' },
    expect: {
      status: 'succeeded',
      validationPassed: true,
      output: {
        quote: { currency: 'USD', subtotal: 6103, discount: 0, total: 6103, formattedTotal: '$61.03', discountCode: null },
      },
    },
  },
];
