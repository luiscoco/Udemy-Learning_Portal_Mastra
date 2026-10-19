# Design

## Context

Verified in a spike with `@mastra/core` 1.78.0:

- **Suspend needs a snapshot store for resume.** A step that calls `suspend(payload)` ends the run `suspended` (`workflow-step-suspended` with `suspendPayload`) even on a bare `createWorkflow`. But `run.resumeStream(…)` on that run fails with "No snapshot found for this workflow run" unless the workflow is registered on a `Mastra` instance. With `new Mastra({ workflows, logger: noopLogger })` (in-memory storage fallback) and `mastra.getWorkflow(id).createRun()`, resume works in the same process. The resume streams the suspended step again and the following steps.
- **Resuming a finished run is refused:** "This workflow run was not suspended". Invalid resume data is refused with "Invalid resume data" (L32 row).
- Reused and already verified:
  - L51 `record_finding` verbatim guard, `structuralIssues`, `supportIssues`, the review structured output and editor slips;
  - L44 `locateQuote` and `CitedAnswerSchema`;
  - L30 `.foreach` concurrency and input-ordered output;
  - L15 and L33 `ctx.requestApproval` bridge (the deadline pauses while waiting; no answer means auto-decline after the runner timeout).

## Decisions

- **Plan** (`plan.ts`): `PlanSchema = { subQuestions: string[2..3] }`. The offline lead maps topics to sub-questions in a fixed order: steps → "How does a Mastra workflow run its steps?", pause/human/approval → "How can a workflow pause for a human?", loop/repeat/retry → "How does a workflow repeat a step safely?", parallel → "How do workflows run steps in parallel?", agent/tool → "How do agents use tools?". It keeps the first three matches; with fewer than two matches it adds the question itself.
- **Research iteration:** a fresh `Notebook` and researcher agent per sub-question (no shared state across concurrent iterations). It returns `{ subQuestion, researcher: 'researcher-i', notes, rejected }`. The researcher index comes from the plan order, carried in the item.
- **Pool:** dedupe by `sourceId + quote` and renumber 1..k in item order. Each pooled note keeps `from` (its researcher).
- **Synthesize:** L51 `EDITOR_INSTRUCTIONS` and the draft prompt with `maxWords`. The slip is appended after the agent answers and recorded as injected.
- **Fact-check:** a fact-checker agent with the L51 review instructions and `ReviewSchema` structured output. Claims = `sentencesOf(draft)`. A sentence is flagged when the structural check flags it or a model issue matches it (normalised containment either way). Model issues that match no sentence are kept as `unmatched`. Offline, the fact-checker script returns `structural ∪ support` issues; live, the model judges support, and the support ratio is reported as `overlap` for transparency.
- **Approval gate** (`approve` step): `suspendSchema = { supported, flagged, preview }`, `resumeSchema = { decision: approve | reject, reviewer, source: preset | learner | timeout }`. The run streams until suspended, then decides: preset `approve` / `reject`, or `ask` → `ctx.requestApproval({ toolName: 'publish-research', args: { supported, flagged }, message })` (a timeout or limit becomes `reject` with source `timeout`), then `resumeStream`.
- **Publish:** `published` when approved and at least one supported claim exists; `rejected` otherwise. The text is the supported sentences in draft order.
- **Live findings (gpt-5-mini).** A run takes about 51–57 s. The live lead wrote longer sub-questions than the offline plan; the researchers still recorded 3–4 verbatim notes each, which pooled to 6–7. The live fact-checker flagged both the planted `unsupported-claim` and `uncited-claim` sentences with sensible reasons and no false flags. An uncited sentence can carry two reasons (structural and model); both are kept.
- **Cited answer:** claims = the published sentences, with citations `{ n, sourceId, quote, quoteStart, quoteEnd }` from `locateQuote(source.text, quote)`. `sources` = the cited sources with `location: "<title> (<sourceId>)"`. `blocked` = the flagged sentences with reasons. `fallback` = nothing published.
