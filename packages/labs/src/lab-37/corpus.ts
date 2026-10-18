/**
 * Built-in course documents for the RAG labs (L37–L40): small, deterministic and fictional, with facts
 * that later labs retrieve and cite.
 */
export interface CorpusDocument {
  docId: string;
  name: string;
  format: 'markdown' | 'text';
  text: string;
}

export const CORPUS: CorpusDocument[] = [
  {
    docId: 'support-handbook',
    name: 'support-handbook.md',
    format: 'markdown',
    text: `# Support handbook

## Refunds
Customers can request a refund within 30 days of delivery. Refunds go back to the original payment method within five business days. Opened software and gift cards cannot be refunded. Partial refunds apply to items returned without their original packaging.

## Escalation
Escalate service outages to the on-call engineer within 15 minutes. Security incidents go to the security team immediately, even outside business hours. Billing disputes above 500 euros need a supervisor's approval before any credit is issued.

## Shipping
Standard shipping takes three to five business days. Express orders placed before noon arrive the next business day. Orders to islands and remote areas can take two extra days.

## Warranty
Hardware carries a two-year warranty covering manufacturing defects. Accidental damage and water damage are not covered. A warranty claim needs the order number and a photo of the defect.
`,
  },
  {
    docId: 'privacy-policy',
    name: 'privacy-policy.txt',
    format: 'text',
    text: `Privacy policy (summary)

We keep order records for six years because tax law requires it. Support chat transcripts are deleted after 12 months unless a dispute is open.

Customers can ask for a copy of their personal data at any time; we answer within 30 days. Payment card numbers are never stored by us: the payment provider keeps them, and we only see the last four digits.

Marketing emails are sent only to customers who opted in, and every email has a one-click unsubscribe link. We do not sell personal data to third parties.
`,
  },
];
