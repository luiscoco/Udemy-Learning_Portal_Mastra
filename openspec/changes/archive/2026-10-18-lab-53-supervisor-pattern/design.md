# Design

## Context

Verified in a spike with `@mastra/core` 1.78.0:

- **Native supervisor.** `new Agent({ agents: { researcher, planner } })` exposes each sub-agent to the supervisor model as a tool `agent-<key>` with input `{ prompt }`; the sub-agent's `description` becomes the tool description.
- **Hooks** are passed per call: `agent.stream(prompt, { delegation: { onDelegationStart, onDelegationComplete, messageFilter } })`.
  - `onDelegationStart(ctx)` gets `{ primitiveId, prompt, toolCallId, iteration, messages, params }` and may return `{ proceed: false, rejectionReason }` or `{ modifiedMaxSteps, modifiedPrompt }`.
  - **A rejected delegation is an ordinary tool result** with text `[Delegation Rejected] <reason>`; `onDelegationComplete` is **not** called for it.
  - `onDelegationComplete(ctx)` gets `{ primitiveId, toolCallId, success, duration, result: { text, usage, subAgentToolResults } }` and may return `{ resultText }` to replace what the supervisor model sees.
  - **Delegations in the same step are started before either completes**, so caps must be reserved at start, not counted at completion.
  - `iteration` was 1 for delegations in two different supervisor steps, so the lab does not use it as a step counter.
  - `messageFilter` returning `[]` leaves the worker with only its delegation prompt.
- **Streams.** The parent stream carries `tool-call` / `tool-result` for `agent-*` tools (result `{ text, subAgentThreadId, subAgentResourceId, subAgentToolResults }`) plus many nested `tool-output` chunks, which the lab ignores.
- **Usage.** Worker usage arrives in `onDelegationComplete`; offline it is the scripted model's own count (small, labelled simulated).

## Decisions

- **Ledger** (`budget.ts`): `Ledger { accepted, perWorker, spentTokens, seen }`. `decideDelegation(ledger, limits, worker, prompt)` checks, in order: `duplicate` (most specific, so a verbatim re-send is reported as a cycle even when a cap would also refuse it), `total-cap`, `per-worker-cap`, `token-budget`; on acceptance it reserves the slot immediately. `normalisePrompt` lowercases and collapses whitespace and punctuation.
- **Audit** (`AuditEntry`): `{ seq, toolCallId, worker, prompt, decision: accepted | refused, reason, budgetBefore, completion: { success, durationMs, usage, workerTools, budgetAfter } | null }`.
- **Workers:** worker step cap `modifiedMaxSteps: 3`. The researcher calls `search_sources` and answers with cited findings; the planner returns numbered steps; the analyst returns risks and a recommendation.
- **Supervisor offline script:** step 1 → research; step 2 → plan (with the research text); step 3 → analysis (with the plan); then a final answer with three labelled sections. `repeat-delegation` adds a verbatim research re-send in step 2. `runaway` keeps delegating "follow-up k" tasks after step 3 and never answers. Live faults append a marked instruction line to the supervisor's instructions.
- **Outcome:** `finished` (final text), `stopped` (iteration cap with no final text; the partial worker results are listed) or `failed`.
- **Hook errors fail closed:** `hookErrorStrategy: 'throw'`. With the default `warn`, a throwing `onDelegationStart` would let the delegation proceed unmodified, bypassing the budget.
- **Live findings (gpt-5-mini).** A full run takes 74–96 s (three sequential worker runs of 8–18 s plus supervisor steps), so the default timeout is 240 s. With the base rule "Do not resend a task" still present, the model ignored the repeat fault; the rule is removed while a fault is injected, after which the model resent the task and it was refused as `duplicate`. `cycle-limits` requires only that the limits hold (no accepted duplicate, steps within the cap); whether a fault was exercised is reported in its message, because a live model may decline it.
- **Transcript:** user → supervisor `task`; supervisor → worker `task` (accepted) or supervisor → orchestrator `refusal`; worker → supervisor `result`; supervisor → user `final`, or orchestrator → human `escalation` when stopped.
