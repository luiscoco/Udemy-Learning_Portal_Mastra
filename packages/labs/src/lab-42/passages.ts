import type { Passage } from './hybrid.js';

/**
 * Fictional support passages: policy text where wording varies (vector search shines) and error codes and
 * order formats where exact tokens matter (keyword search shines). One passage per record.
 */
export const PASSAGES: Passage[] = [
  {
    id: 'refunds',
    docId: 'support-handbook',
    source: 'support-handbook.md#refunds',
    text: 'Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method within five business days.',
  },
  {
    id: 'escalation',
    docId: 'support-handbook',
    source: 'support-handbook.md#escalation',
    text: 'Escalate service outages to the on-call engineer within 15 minutes. Security incidents go to the security team immediately.',
  },
  {
    id: 'shipping',
    docId: 'support-handbook',
    source: 'support-handbook.md#shipping',
    text: 'Standard shipping takes three to five business days. Express orders placed before noon arrive the next business day.',
  },
  {
    id: 'warranty',
    docId: 'support-handbook',
    source: 'support-handbook.md#warranty',
    text: 'Hardware carries a two-year warranty covering manufacturing defects. Accidental damage and water damage are not covered.',
  },
  {
    id: 'privacy',
    docId: 'privacy-policy',
    source: 'privacy-policy.txt',
    text: 'Support chat transcripts are deleted after 12 months unless a dispute is open. Order records are kept for six years.',
  },
  {
    id: 'err-4012',
    docId: 'error-codes',
    source: 'error-codes.md#e-4012',
    text: 'Error E-4012: the card payment was declined by the bank. Ask the customer to try another card.',
  },
  {
    id: 'err-5003',
    docId: 'error-codes',
    source: 'error-codes.md#e-5003',
    text: 'Error E-5003: the warehouse could not reserve the item. Offer a back-order or a similar product.',
  },
  {
    id: 'err-7001',
    docId: 'error-codes',
    source: 'error-codes.md#e-7001',
    text: 'Error E-7001: the delivery address failed validation. Ask the customer to check the postcode.',
  },
  {
    id: 'order-format',
    docId: 'support-handbook',
    source: 'support-handbook.md#order-numbers',
    text: 'Order numbers look like ORD-5521: the letters ORD, a dash and four digits. Quote it in every reply.',
  },
];
