# Proposal

## Why

Workflow labs (L26–L35) show step events as a flat timeline. Learners cannot see the shape of a workflow (sequence, parallel steps, branches, loops, nested workflows) or where a run is right now. The L68 DoD: render a read-only visual DAG with live step statuses from execution events; workflow nodes reflect real statuses; inaccessible workflows are hidden.

A spike with @mastra/core 1.78.0 showed what Mastra provides:

- **The graph:** `workflow.serializedStepGraph` describes the committed graph as entries of type `step`, `parallel`, `conditional` (with `serializedConditions`), `foreach`, `loop`, and `workflow` for nested workflows (with `serializedStepFlow`).
- **Step ids:** the run stream reports `workflow-step-start/result` with the same step ids. Nested steps are prefixed (`shipping.book`).
- **Untaken branches:** a branch that is not taken never starts.

## What Changes

- **Contracts (additive):**
  - `WorkflowGraphSchema` `{ workflowId, title, nodes[{ id, label, kind, layer, lane, group?, description? }], edges[{ from, to, kind: next | branch, label? }] }`;
  - a new execution event `workflow-graph` `{ workflowId, graph }`, added to `EXECUTION_EVENT_TYPES`.
- **`packages/labs/src/shared/workflow-graph.ts`:** `toWorkflowGraph(workflow)` converts `serializedStepGraph` into a layered DAG.
  - Every serialized step becomes a node; nested workflow steps get prefixed ids and a group.
  - Parallel and conditional steps share a layer in separate lanes; conditional edges carry their condition id; foreach and loop steps are marked.
  - It reads only the graph, never closures or source code.
- **New lab `lab-68` (Module 14).** Real Mastra workflows with steps that simulate business logic. All workflows are offline (no model).
  - **Workflows, each with visibility:**
    - `order-fulfilment` (every learner): validate, then parallel stock and fraud checks, a branch to manager review or auto-approve, foreach item packing, and a nested shipping workflow;
    - `refund-override` (supervisors only);
    - `payroll-export` (no learner role).
  - **Inputs:** role, workflow id, order value (which branch runs), item count, a step to fail and a step delay.
  - **The run:**
    - checks visibility first: a hidden workflow returns exactly the same "not found" result as an id that does not exist, with no graph, title or step names;
    - emits `workflow-graph`, then streams the real run with the existing `streamWorkflow`;
    - outputs `{ visible[], graph, statuses, result }`. Statuses come from Mastra's own step results: an untaken branch is `skipped`, and steps after a failure are `not-reached`.
- **Web:**
  - a `WorkflowGraph` component renders the DAG read-only (CSS grid by layer and lane, with SVG connectors);
  - node status comes live from `workflow-step` events and falls back to `skipped`/`not-reached` when the run ends;
  - an accessible list view mirrors the graph;
  - the run reducer stores the `workflow-graph` event, and the timeline describes it;
  - the Run tab shows the graph whenever a run emitted one, so other workflow labs can use it later.
- **Tests:**
  - graph conversion for every entry type;
  - the lab: statuses match Mastra for every branch and failure, and hidden and unknown ids are indistinguishable;
  - reducer and component tests (live statuses);
  - e2e (graph appears, nodes turn success, untaken branch skipped, hidden workflow not listed);
  - contract tests updated for the new event.
