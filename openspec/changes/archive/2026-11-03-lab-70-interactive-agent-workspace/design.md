# Design

## Lab 70 (`packages/labs/src/lab-70/`)

- **`knowledge.ts`:**
  - three markdown fixture policies (refunds, shipping, warranty) as `LibraryDocument`s, with the SHA-256 of their text;
  - `seedFixtures(library)` stores each with `put` and returns `{ added, existing }`;
  - `passagesOf(docs)` splits each document into paragraphs with ids `<name>#<n>`;
  - `search(query, passages, k = 4)` scores passages by keyword overlap.
  - The library is `courseLibrary(ctx.services)`, which lives in the learner's partition (L62).
- **`tools.ts`:** `createWorkspaceTools({ ctx, passages, retrieved })`.
  - `searchDocs` adds the passages it returns to `retrieved`, the guard's ground truth for this turn.
  - `planTasks` and `completeTask` keep the task list and emit `workflow-step` events with `stepId: 'task:<n>'`, `input: { title }`, and status `waiting`, `running` or `success`.
- **`run.ts`:**
  - Runs on a thread are serialized per tenant partition and thread id. The memory store is `lab-70-workspace`.
  - `send` runs `agent.stream(message, { memory: { thread, resource }, maxSteps: 6, abortSignal })` through `consumeStream`, which emits tool events and tokens.
  - `guardClaims` then checks the answer against `retrieved`. The output carries the messages (an assistant message stored as claims JSON is shown as its claim text), the tasks and the cited answer.
- **Offline script:**
  - turn 1: `planTasks([...three tasks])`;
  - turn 2: `completeTask(1)` and `searchDocs(question)`;
  - turn 3: `completeTask(2)`, `completeTask(3)` and the claims JSON, quoting the first sentence of each matching passage exactly.

## Web (`AgentWorkspace.tsx`)

- **State:** one `useLabRun`. `history` runs on mount; `send` and `seed` run on demand. The transcript comes from `output.workspace` of the last finished run.
- **Live:** task statuses come from `state.steps` with the `task:` prefix, the Tools tab from `state.tools`, the trace from `TraceView`, and citations from `CitedAnswer`.
- **Layout:** three columns at `lg`; below that, a "Show pane" button group (`aria-pressed`) shows one pane at a time; tab semantics would be wrong at `lg`, where all panes are visible together.
- **Inspector tabs:** the ARIA tabs pattern (roving tabindex, arrow keys). The document preview is a native `<dialog>` with a labelled heading and a close button.
