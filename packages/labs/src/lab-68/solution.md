# Workflow visualizer

Derive the graph from the committed workflow, send it before the run, and colour nodes from real events.

```ts
const entry = findVisible(input.workflowId, input.role);
if (!entry) return notFound(); // identical for hidden and unknown ids: nothing leaks

const workflow = entry.build(); // createWorkflow(...).then(...).parallel(...).branch(...).foreach(...).then(nested).commit()
const graph = toWorkflowGraph(workflow, entry.title); // from workflow.serializedStepGraph
ctx.emit({ type: 'workflow-graph', workflowId: entry.id, graph });
const res = await streamWorkflow(ctx, entry.id, await workflow.createRun(), inputData); // workflow-step events by step id
```

`toWorkflowGraph` maps entries: `step` → a node on the next layer; `parallel` and `conditional` → one layer, a lane per child (branch edges labelled with the condition id); `foreach`/`loop` → a marked node; `workflow` → a header node plus its `serializedStepFlow`, with ids prefixed `<workflowId>.` exactly as the run stream reports nested steps (`shipping.bookCourier`). Serialized `fn` source is never copied.

Final statuses come from Mastra's step results; a branch alternative whose sibling ran is `skipped`; anything else that never ran is `not-reached`. The browser's `WorkflowGraph` component draws the nodes in a grid (layer = column, lane = row) and takes each node's live status from the latest `workflow-step` event with its id.

Challenge outline: in Lab 32 emit `workflow-graph` from its workflow before streaming; in `WorkflowGraph`, render `suspended` with its own colour and label; resuming emits `success` for the same step id, which turns the node green.

Example input: learner, order-fulfilment, €120, 3 items. Expected: autoApprove success, managerReview skipped, every other node success; only order-fulfilment is listed.
