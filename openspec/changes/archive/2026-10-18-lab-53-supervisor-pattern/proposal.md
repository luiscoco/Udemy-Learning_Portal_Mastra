# Proposal

## Why

The supervisor pattern is the third multi-agent architecture of Module 11: one agent plans the work and dispatches it to worker agents, then combines their results. Without limits, a supervisor can delegate the same task over and over, spend an unbounded number of tokens or never stop.

The DoD asks for a supervisor that dispatches research, planning and analysis tasks under budget constraints, with every agent decision audited and cycle limits respected.

## What Changes

- **New lab `lab-53`** (Module 11), built on Mastra's native supervisor support: a supervisor `Agent` with `agents: { researcher, planner, analyst }`. Mastra exposes each worker as a delegation tool `agent-<key>` with input `{ prompt }`.
  - **Researcher** has `search_sources` over the L51 local source pack. **Planner** and **Analyst** have no tools.
- **Budget and cycle guard** in `delegation.onDelegationStart` (native hook), decided by a pure `decideDelegation()`:
  - total delegation cap (`maxDelegations`);
  - per-worker cap (`perWorkerLimit`);
  - duplicate delegation (same worker and same normalised prompt) refused as a cycle;
  - token budget (`tokenBudget`): no delegation starts once the workers' reported usage reaches it.

  Accepted delegations get `modifiedMaxSteps` (worker step cap). Refusals return `{ proceed: false, rejectionReason }`, which the supervisor sees as `[Delegation Rejected] …`.
- **Iteration cap:** the supervisor runs with `maxSteps: maxIterations`. A run that hits the cap without a final answer is reported as `stopped` with the partial results, never hidden.
- **Audit:** every decision is recorded by tool call id: worker, prompt, accepted or refused with reason, budget before; and on completion (`onDelegationComplete`) its usage, duration, success, the worker's tool calls and the remaining budget. `resultText` appends the remaining budget to each worker result, so the supervisor can see it.
- **Minimum context:** `messageFilter` returns no parent messages, so a worker sees only its delegation prompt.
- **Faults** (both modes, marked as injected): `repeat-delegation` (the supervisor re-sends the research task verbatim) and `runaway` (the supervisor never finishes and keeps delegating).
- **Transcript:** `output.agentConversation` (L51 contract) gains the additive message kinds `result` and `refusal`.
- **Checks:** `decisions-audited`, `budget-respected`, `cycle-limits`, `tasks-dispatched`, `final-answer`.

## Capabilities

### New Capabilities

- `course-labs/lab-53-supervisor-pattern`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-53/`, `packages/contracts/src/agent-conversation.ts` (additive kinds), web kind badges, an e2e spec, catalog flag, registry, COMPATIBILITY row.
- **Modes:** offline (scripted, free) and live (up to `maxIterations` supervisor steps and up to `maxDelegations` worker runs of at most 3 steps each).
