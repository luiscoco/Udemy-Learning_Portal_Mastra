# Proposal

## Why

Module 11 starts multi-agent architectures. The first pattern is the simplest one that is still honest: two agents with separate roles, connected by an explicit workflow instead of by a shared chat or by one agent calling the other freely.

The DoD asks for a research agent and an editor agent connected through an explicit orchestrating workflow, with the messages, intermediate outputs and final result shown.

## What Changes

- **New lab `lab-51`** (Module 11). A Mastra workflow `research-editor-workflow` orchestrates two Mastra `Agent`s:
  - **Researcher**: tools `search_sources` and `record_finding` over a small local source pack (`sources.ts`, no web access). `record_finding` rejects a quote that is not verbatim in its source, so every note is grounded by construction.
  - **Editor**: no tools. It writes only from the notes it is handed, citing each sentence with `[n]`.
- **Workflow steps** (the orchestrator owns all control flow):
  1. `research`: the researcher searches and records findings (tool events stream to the trace).
  2. `draft`: the editor receives the request and the notes (the explicit handoff payload) and writes a cited draft.
  3. `review-and-revise` in `.dountil()`: the researcher reviews the draft against the notes (structured output `{ approved, issues }`), the orchestrator adds deterministic structural issues (uncited sentence, unknown citation), and the editor revises when there are issues. The loop is bounded by `maxRevisions`.
  4. `publish`: an approved draft is published; otherwise the result is `needs-human` with the remaining issues, and no ungrounded text is published.
- **Editor slip** (fault injection, both modes): the orchestrator plants one bad sentence in the first draft (`uncited-claim`, `unknown-citation` or `unsupported-claim`), labelled as injected, so learners can watch the review catch it.
- **Transcript.** Every handoff is recorded as a message (`from`, `to`, `kind`, `stepId`, `round`, content). A new contract `AgentConversationSchema` (`output.agentConversation`) is rendered by a new web component `AgentConversation` (agents, messages in order, outcome). It is reusable by L52 and L53.
- **Checks:** `roles-separated`, `explicit-handoffs`, `notes-grounded`, `review-loop-bounded`, `final-grounded`.

## Capabilities

### New Capabilities

- `course-labs/lab-51-two-collaborating-agents`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-51/`, `packages/contracts/src/agent-conversation.ts`, `apps/web/src/components/workspace/AgentConversation.tsx` (+ test), `RunTab.tsx`, an e2e spec, catalog flag, COMPATIBILITY row.
- **Modes:** offline (scripted models, free) and live (one research run of up to 6 steps, one draft, up to `maxRevisions` + 1 reviews and `maxRevisions` revisions).
