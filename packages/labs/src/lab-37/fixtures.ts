import type { LabFixture } from '../fixtures.js';
import { lab37Definition } from './definition.js';

const example = lab37Definition.exampleInput;

/** The text that made Mastra's sentence chunker emit a lone "." (verified on @mastra/rag 2.6.6). */
export const SENTENCE_FRAGMENT_TEXT = `# Support handbook

## Refunds
Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method. Partial refunds apply to opened items.

## Escalation
Escalate outages to the on-call engineer within 15 minutes. Security incidents go to the security team immediately.

## Shipping
Standard shipping takes three to five business days. Express orders placed before noon arrive the next business day.
`;

export const lab37Fixtures: LabFixture[] = [
  {
    name: 'sentence chunking leaves a lone "." that is dropped, not returned',
    input: { source: 'paste', text: SENTENCE_FRAGMENT_TEXT, configs: [{ label: 'sentence-120', strategy: 'sentence', maxSize: 120, overlap: 0 }] },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'markdown chunking follows headings',
    input: { ...example, configs: [{ label: 'md', strategy: 'markdown', maxSize: 600, overlap: 0 }] },
    expect: { status: 'succeeded', validationPassed: true },
  },
  {
    name: 'small chunks with large overlap: more chunks and more repeated text',
    input: { ...example, configs: [{ label: 'recursive-120-60', strategy: 'recursive', maxSize: 120, overlap: 60 }] },
    expect: { status: 'succeeded', validationPassed: true },
  },
];
