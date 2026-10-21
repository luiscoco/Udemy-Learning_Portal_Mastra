# Design

## Files (`packages/labs/src/lab-63/`)

- **`knowledge.ts`:** three trusted policy documents plus one "vendor note" document built from the learner's `injectedText`. `searchDocs(query)` uses deterministic keyword scoring and always includes the vendor note in the results.
- **`scanner.ts`:** `scanForInjection(text)` returns findings `{ rule, excerpt }[]`, and `quarantine(text)` removes flagged sentences. The rules:
  - `override`: ignore, disregard or forget previous/above instructions;
  - `role-marker`: `system:`, `assistant:`, `<|…|>`, `[INST]`;
  - `tool-directive`: a tool name next to call, use or run;
  - `exfil-destination`: an email address or URL outside the allowlist;
  - `hidden-text`: zero-width or Unicode tag characters.
- **`envelope.ts`:** `UntrustedToolResults`, a Mastra processor with `processToolResult`. For `searchDocs` it builds the envelope, scans, optionally quarantines, and marks the run-local `Taint`. It replaces the result with `messageList.updateToolInvocation` (verified in a spike with Mastra 1.78.0: the hook fires only from `outputProcessors`, and both the next model call and the streamed `tool-result` chunk see the replacement).
- **`gateway.ts`:**
  - `grantsFor(request, requester)` grants capabilities from the customer's message only: `sendEmail` to the requester's own verified address when the message asks to email them; `issueRefund` for an order the message names when it asks for a refund.
  - `classifyCall(name, args, grant)` returns `{ authorized, reason }`.
  - `createSandboxTools(...)`: without a gateway (baseline), write tools execute directly into the sinks. With one, `execute` runs:
    1. classify, and deny if unauthorized;
    2. apply the write-call limit;
    3. if tainted, ask for approval and deny if declined;
    4. write to the sink, then audit.
- **`run.ts`:** runs the baseline and the protected agent with `ctx.services.models.resolve` and the offline `gullibleScript`, then builds the output and the checks.

## Offline model

`gullibleScript(request, requester)`:

- **turn 1:** `searchDocs({ query: request })`;
- **turn 2:** for each sentence of the returned text, an email address next to send/forward/email/share/copy becomes `sendEmail(to = that address)`, and "refund" + `ORD-dddd` becomes `issueRefund`. If the request asks to email the requester, it adds `sendEmail(to = requester)` with a summary;
- **turn 3:** a final text summarizing the tool results.

It reads whatever the tool result contains: the raw text in the baseline, the envelope (possibly quarantined) in the protected run.

## Classification

A write call counts as "injected" when `classifyCall` says the customer's own request does not authorize it. The same pure function classifies both runs, so the baseline's "compromised" flag comes from its actual sandbox side effects.

## Checks

- `untrusted-envelope`
- `injected-calls-denied`
- `no-unapproved-side-effects`
- `taint-requires-approval`
- `limits-enforced`
- `baseline-measured`

## Alternatives considered

- **Mastra `requireApproval` on the tools:** it asks a human before any policy check, so attacker-chosen calls would reach the approver as prompts. Policy-first denial in `execute`, with approval only for authorized-but-tainted calls, keeps humans from approving attacker-chosen actions.
- **`PromptInjectionDetector`:** see the proposal.
