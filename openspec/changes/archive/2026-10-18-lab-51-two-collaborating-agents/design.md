# Design

## Context

Verified in a spike with `@mastra/core` 1.78.0:

- **Structured output from a tool-equipped agent.** `agent.generate(prompt, { structuredOutput: { schema }, toolChoice: 'none' })` on an agent that has tools sends no tools to the model (`toolNames: []`, JSON response format) and returns the parsed value in `result.object`. The same agent can therefore research with tools and review without them.
- **`.dountil(step, condition)`.** The step's output is fed back as its next input; `condition({ inputData, iterationCount })` sees the latest output and a 1-based count. The stream emits one `workflow-step-start` / `workflow-step-result` pair per iteration with the same step id. The final `steps` record keeps only the last iteration, and **`stepExecutionPath` is `[]` for a run that contains a loop**, so the lab derives the path from the streamed step traces.
- Mastra has no built-in iteration cap on `dountil`; the bound is the app's condition.

## Decisions

- **Sources** (`sources.ts`): six short local documents `S1`–`S6` about Mastra workflows, steps, parallel branches, suspend/resume, agents and tools. `searchSources(query, limit)` ranks by keyword overlap.
- **Researcher tools** (`agents.ts`): `search_sources({ query })` → `{ results: [{ sourceId, title, text }] }`; `record_finding({ claim, sourceId, quote })` accepts a finding only when `quote` appears verbatim in that source (else `{ accepted: false, reason }`), and at most 6 findings. Accepted findings are numbered `n = 1..k` and kept in a per-run notebook owned by the orchestrator.
- **Grounding helpers** (`grounding.ts`): `sentencesOf(text)`, `citationsOf(sentence)` (`[1]`, `[1, 2]`, `[1][2]`), `structuralIssues(draft, notes)` (uncited sentence, unknown citation number) and `supportIssues(draft, notes)` (lexical overlap of content words with the cited notes below 0.4). Structural issues are always added by the orchestrator (not trusted to a model); support issues are what the offline reviewer script reports, while live the model judges support.
- **Workflow** (`workflow.ts`): `research` → `draft` → `.dountil(review-and-revise, approved || exhausted)` → `publish`. The loop state is `{ draft, revisions, approved, exhausted, lastIssues }`. Each iteration reviews the current draft; with issues it revises when `revisions < maxRevisions`, otherwise it sets `exhausted`. Iterations = revisions + 1.
- **Editor slip** is applied by the `draft` step after the editor answers, in both modes, and recorded as `injected` in the transcript: `uncited-claim` "Mastra workflows were first designed to steer spacecraft.", `unknown-citation` "Steps can also be written in Python [9].", `unsupported-claim` "Every workflow step runs on its own GPU cluster [1].".
- **Transcript.** A `post()` helper owned by the run records messages `{ seq, from, to, kind, stepId, round, summary, content, injected? }` and logs a one-line summary. Agents: `orchestrator` (the workflow), `researcher`, `editor`.
- **Contract** `AgentConversationSchema` (`packages/contracts/src/agent-conversation.ts`): `agents[{ id, name, role, tools[] }]`, `messages[]` with `kind ∈ task | handoff | notes | draft | review | revision | final | escalation`, `outcome { status: published | needs-human | failed, text, issues[] }`. Rendered as text by `AgentConversation` (ordered list, `from → to`, kind badge, step and round, collapsible content).
- **Offline scripts.** Researcher: turn 1 `search_sources(request)`, turn 2 `record_finding` for the first sentence of each of the top 3 results, turn 3 a one-line summary; review turns (`jsonMode`) return `structural ∪ support` issues parsed from the prompt. Editor: each note becomes "claim [n]."; a revision removes the flagged sentences.

## Risks

- A live editor may paraphrase so that the offline-only support heuristic would disagree; it is not used live.
- A live reviewer can miss an unsupported claim; the transcript shows it, and the structural guard still runs.
