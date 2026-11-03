# Interactive agent workspace

One run feeds every pane: the event stream drives what is happening now, the verified output drives what you can trust.

```ts
// Server: tools that report progress, and a guard over what was actually retrieved.
const tools = createWorkspaceTools({ ctx, passages: passagesOf(myDocuments), retrieved, tasks });
// planTasks  -> emits workflow-step "task:<n>" (waiting / running)
// completeTask -> emits "task:<n>" success, next task running
// searchDocs -> returns passages { id, source, text } and records them in `retrieved`
const stream = await agent.stream(question, { memory: { thread, resource: 'learner' }, maxSteps: 8 });
await consumeStream(ctx, stream);
const { citedAnswer, verdicts } = guardClaims(answerText, [...retrieved.values()], { enforce: true });
```

Browser (`AgentWorkspace`): Knowledge pane = `output.workspace.documents`; Chat = `output.workspace.messages` plus a live status while the run streams; Inspector tabs: Tasks = steps whose `stepId` starts with `task:` (live), Tools = `state.tools` (live), Trace = `TraceView(state)` (live), Citations = `CitedAnswer(output.workspace.citedAnswer)`. Below the `lg` breakpoint, a pane switcher shows one pane at a time.

Challenge outline: add `action: 'upload'` with a `file` input; reuse Lab 36's `ingest()` (sniffing, size and page limits) and `courseLibrary(ctx.services).put(doc)`; the next `send` sees its passages because `passagesOf(documentsOf(library))` is rebuilt per turn.

Example input: seed, then ask “How long do refunds take?”. Expected: three tasks done, searchDocs returns refund-policy passages, and the shown claims quote them exactly.
