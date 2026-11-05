# Enterprise assistant: reference and demo

The default question reads a trusted sample policy from your tenant library. A real MCP connection exposes only a read-only, tenant-scoped case lookup. The researcher uses both tools and durable Mastra memory; the reviewer produces structured claims. The server verifies their quotes against current-turn passages, then a native deterministic Mastra scorer produces a binary evidence gate. The workflow progresses through research, review, evaluate, approve and execute.

The action is an application adapter, not a Mastra payment API. `issueRefund` checks case ownership, a 30-day unused-item policy, the case total, quality and approval, then atomically records one simulated receipt per case. It is never available as a model tool. A replay returns the existing receipt; a different amount returns conflict. No money moves.

## Demo

1. Open `/labs/lab-75?tab=run` and run offline with the defaults. Expect quality score 1 and an issued receipt (or already-issued on repeats).
2. Open the cited policy passage. Inspect MCP lookup, searchDocs, the automated checks and Trace spans.
3. Repeat the run with the same thread: memory counts increase and the existing receipt is returned.
4. Choose **Ask me in the Run tab**, run, and decline. No refund is made by this run. Repeat and cancel while waiting to prove cancellation.
5. Choose the unavailable case, then the expired case, then an amount over 25000 cents. Each blocks execution independently of approval.
6. Inject an invented citation: the claim is withheld, quality is zero and no refund is possible. Ask about quantum entanglement with No fault to demonstrate missing evidence.

The preset approval options are labelled teaching fixtures, not assertions that a human approved. Existing HTTP authentication owns the run; the learner's server-resolved tenant owns all memory, documents and receipts. Browsers never choose an owner or receive MCP credentials.

## Boundaries

- Offline models are scripted; workflow execution, MCP HTTP, libSQL memory, scoring and native tracing are real.
- Live generation uses the configured server provider and costs money. It retains the same simulated cases and payments. Model/tool/output limits are enforced, but there is no dollar spending cap.
- Keyword retrieval is a deliberately small app-level RAG adapter. Exact quotes and lexical checks are useful evidence checks, not proof of semantic entailment. Business eligibility comes from trusted server policy.
- The tenant lock and ledger guarantee apply within one API process. Pending HTTP approvals are in memory; a restart loses them. This lesson does not complete the platform's separate public-host release gates.
- Reference source is read-only. Exercise edits belong in a learner's local project and are never executed by the API.

## Challenge approach

Add a new server-owned case record and explicit policy mapping. Bind each receipt to the tenant, case and amount. Add tests proving valid approval, wrong policy, cross-case replay, tenant isolation and repeated execution; keep model-generated text outside the permission decision.
