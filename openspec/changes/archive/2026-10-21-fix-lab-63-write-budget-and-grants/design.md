# Design

- **Write budget.** In `createSandboxTools`, the `guarded()` order becomes: classify → (unauthorized: deny, no budget used) → budget check on authorized calls (`authorizedWrites += 1; if > maxWriteCalls` deny `WRITE_LIMIT`) → approval when tainted → perform.
  - The `limits-enforced` check is unchanged: executed side effects ≤ `maxWriteCalls`.
- **Negation.** `NEGATED = /\b(don'?t|do not|never|no need to|please don'?t)\b[^.]{0,25}\b(e-?mail|send|mail|refund)\b/i`, tested per sentence of the customer message.
  - A sentence that negates email grants no email. A sentence that negates refund grants no refund.
  - It is deliberately simple and errs towards granting less.
- **Tests (`lab63.test.ts`):**
  - flood: four injected email sentences, the customer asks for the summary, so the outbox holds exactly the customer's email and the audit has four denials and no `WRITE_LIMIT`;
  - negation grants;
  - two concurrent approvals in ask mode.
