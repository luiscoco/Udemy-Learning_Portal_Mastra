# Design

## Graph conversion (`shared/workflow-graph.ts`)

`walk(entries, prefix, group, layer)` returns the next free layer.

| Entry | Node(s) | Layer and lane | Edges |
| --- | --- | --- | --- |
| `step` | `{ id: prefix + id, kind: 'step', layer, lane: 0 }` | next layer | `next` from the previous frontier |
| `parallel` | one node per child, `kind: 'parallel'` | same layer, lanes 0..n | `next` from the previous frontier; the frontier becomes all children |
| `conditional` | one node per child, `kind: 'branch'` | same layer, separate lanes | `branch`, labelled with the condition id (`review-condition` becomes `review`) |
| `foreach` | the child, `kind: 'foreach'` | own layer | `next` |
| `loop` | the child, `kind: 'loop'` (label `dowhile`/`dountil`) | own layer | `next` |
| `workflow` | a group header `kind: 'workflow'`, id = prefix + workflowId; its `serializedStepFlow` walks with prefix `${id}.` and group = id | header first, then the children | `next` from the header |
| `sleep`/`sleepUntil` | `kind: 'sleep'` | own layer | `next` |

Labels are the step id; the description is kept for tooltips. Nothing executable is serialized: Mastra's `fn` fields are dropped.

## Lab 68

- **`workflows.ts`** builds the three workflows with `createWorkflow` / `createStep`. Steps sleep `stepDelayMs` (honouring the abort signal) and throw when `failStep` names them. `CATALOG` maps each id to `{ title, visibleTo: Role[] }`, and `visibleFor(role)` lists what a role may see.
- **`run.ts`:**
  - If the workflow is not visible, return `{ visible, requested, found: false, graph: null }`, the same as for an unknown id, and log "Unknown workflow" in both cases.
  - Otherwise emit `{ type: 'workflow-graph', workflowId, graph }`, then `streamWorkflow(ctx, id, run, inputData)`.
  - `statuses`:
    - for each node, Mastra's step record status where one exists (`success`, `failed`, `suspended`);
    - otherwise `skipped` if it is a branch alternative whose sibling ran;
    - otherwise `not-reached`.

### Checks

| Check | What it verifies |
| --- | --- |
| `graph-complete` | Every executed step id has a graph node, and every node id is unique. |
| `statuses-real` | Node statuses equal Mastra's step results. |
| `branch-reflected` | Exactly one branch alternative succeeded and the others are skipped. |
| `failure-reflected` | With `failStep`, that node failed and downstream nodes are `not-reached`. |
| `live-order` | Each executed node emitted `running` before its terminal status. |
| `hidden-indistinguishable` | Every visible-list entry is allowed for the role, and the hidden or unknown response carries no workflow data. |

## Web

- **Reducer:** case `workflow-graph` sets `state.workflowGraph` (the last one wins).
- **`WorkflowGraph.tsx`:** nodes are placed in a CSS grid (`gridColumn = layer`, `gridRow = lane`); connectors are drawn as an SVG overlay from measured node boxes. A status badge uses colour and text: Waiting, Running, Done, Failed, Skipped, Not reached. An accessible `<ol>` lists the steps by layer with their status.
- **Status:** `state.steps` (stepId → latest status); when the run is finished, a node with no events shows `statusFromOutput` or `not-reached`.
- **RunTab:** renders `<WorkflowGraph>` when `state.workflowGraph` exists. The visible-workflows list renders from `output.visible`.
