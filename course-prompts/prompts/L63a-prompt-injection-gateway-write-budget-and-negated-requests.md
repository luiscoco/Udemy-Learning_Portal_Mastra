# L63a — Prompt-injection gateway: write budget and negated requests

**Module:** 13 Security and Reliability · **Step 77 of 89** · **OpenSpec change:** `fix-lab-63-write-budget-and-grants`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L63](L63-untrusted-input-and-prompt-injection.md) · Next: [L64](L64-tool-approval-policies.md)

## Copy-ready prompt

Implement platform follow-up L63a — "Prompt-injection gateway: write budget and negated requests".

Why: a review of L63 found two gateway gaps. (1) If the per-run write limit counts every write call, including calls denied by policy, a document with enough injected instructions uses up the budget and the customer's own legitimate action fails: an attacker-controlled denial of service. (2) Capability grants matched words like "email … me" without noticing negation, so "please don't email me" granted an email.

Requirements:
- Classify each write call first. Calls denied by policy cost no budget (they stay bounded by the agent's step and tool-call budget); the write limit counts authorized side-effect attempts only.
- Judge grants per sentence of the customer's message; a sentence that negates an action ("don't", "do not", "never", "no need to" shortly before the verb) grants nothing for it. Err towards granting less.
- Tests: an injection flood (more injected calls than the limit) still lets the customer's own action reach approval and run once; negated requests grant nothing; two authorized actions in one model turn with "ask me" wait for two decisions and each runs exactly once.

Definition of done: the new tests fail on the old behaviour and pass now; all L63 checks still pass offline and live.

First create an OpenSpec change named fix-lab-63-write-budget-and-grants with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
