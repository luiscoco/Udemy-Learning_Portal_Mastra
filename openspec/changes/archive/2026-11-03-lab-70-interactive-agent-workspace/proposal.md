# Proposal

## Why

The L70 DoD: combine chat, tools, citations, trace, knowledge documents and task progress in one responsive screen, with an end-to-end UI flow that works on seeded fixtures and passes accessibility tests. The pieces exist separately:

- chat on memory threads (L67);
- a per-learner document library (L36/L62);
- claims that are verified against retrieved passages (L44 `guardClaims`, rendered by `CitedAnswer`);
- tool and step traces in the run reducer and `TraceView`;
- live step events.

## What Changes

- **Contracts (additive):**
  - `LabDefinition.presentation` gains `workspace`;
  - `WorkspaceTurnSchema` for `output.workspace`: `{ threadId, documents[], messages[], citedAnswer?, tasks[], seeded? }`.
- **New lab `lab-70` (Module 14): a support-knowledge workspace.**
  - **Actions:**
    - `seed`: put three fixture policy documents (refunds, shipping, warranty) into the learner's own library. Idempotent; returns `added`/`existing`.
    - `history`: the documents and the thread messages, with no model call.
    - `send`: one chat turn on a learner-owned Mastra memory thread.
  - **Agent tools:**
    - `planTasks({ tasks[] })` emits a `workflow-step` per task (`task:<n>`: waiting, then the first task running);
    - `completeTask({ n })` marks task n done and the next one running;
    - `searchDocs({ query })` does keyword retrieval over the learner's library and returns passages with ids and their text.
  - **The answer.** The final answer is L44's JSON claims format, checked by `guardClaims` against the passages `searchDocs` returned in this turn. Only verified claims are shown; blocked claims are reported.
  - **Offline vs live.** Offline, a scripted model plans 3 tasks, searches, completes them and answers with exact quotes. Live, the learner's model receives the same tools and instructions.
  - **Checks:**
    - `documents-seeded`: the fixtures are in the learner's library;
    - `tasks-progressed`: every planned task ended done, each shown running first;
    - `tools-used`: searchDocs ran and returned passages;
    - `citations-verified`: every shown claim quotes a passage returned this turn; the answer has at least one claim, or an honest "not in the documents";
    - `history-persisted`;
    - `no-cross-learner-docs`: only this learner's library was searched.
- **Web: `AgentWorkspace`** for `presentation: 'workspace'`:
  - **Knowledge pane:** the document list, "Seed sample documents", and a document preview dialog.
  - **Chat pane:** the thread, a live status while the run streams, a composer and Stop.
  - **Inspector:** keyboard-accessible tabs.
    - Citations: the existing `CitedAnswer`.
    - Tools: tool calls with arguments, results and durations.
    - Trace: the existing `TraceView`.
    - Tasks: a live checklist built from the `task:<n>` steps.
  - **Layout:** three columns at desktop width; a pane switcher (Knowledge, Chat, Inspector) on narrow screens; no horizontal page scroll.
- **Tests:**
  - lab tests (seed idempotency, turn with tasks/tools/citations, a bad quote is blocked, per-learner isolation);
  - component tests for the workspace (panes, tabs, keyboard);
  - e2e with seeded fixtures on desktop and mobile: seed, ask, tasks complete, open a citation, inspect tools and trace, reload keeps history, axe on the workspace and the document dialog, no horizontal overflow;
  - live check.
