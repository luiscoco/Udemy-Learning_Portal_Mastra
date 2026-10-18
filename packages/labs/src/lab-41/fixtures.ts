import type { LabFixture } from '../fixtures.js';
import { lab41Definition } from './definition.js';

const example = lab41Definition.exampleInput;

export const lab41Fixtures: LabFixture[] = [
  {
    name: 'model-chosen filter: the Globex question leaks Globex documents to Acme',
    input: { ...example, tenantScoping: 'model-filter' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'no tenant filter: cross-tenant results everywhere',
    input: { ...example, tenantScoping: 'none' },
    expect: { status: 'succeeded', validationPassed: false },
  },
  {
    name: 'a plain value on the tags array silently matches nothing',
    input: {
      ...example,
      cases: [
        {
          tenant: 'acme',
          role: 'customer',
          question: 'When does my order arrive?',
          asOf: '2026-06-01',
          filter: { tags: 'shipping' },
          expect: 'none',
        },
      ],
    },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
