# Design

## Context

Verified against the installed `@mastra/core` 1.78.0 (spike):

- `instructions: DynamicArgument<AgentInstructions>` accepts `({ requestContext, mastra }) => string | Promise<string>`.
- `RequestContext` is exported from `@mastra/core/request-context`: `new RequestContext([[key, value]])`, with `get`, `set`, `has` and `keys`.
- `agent.generate(prompt, { requestContext })` passes the context through. Three parallel calls on one agent each resolved their own instructions.
- `requestContextSchema` on the agent validates the context at the start of `generate` and `stream`. Invalid values throw MastraError `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED` before any model call.
- A module variable set before `await agent.generate()` leaks deterministically under `Promise.all`: all three requests saw the last value.

## Decisions

- **One agent per run, shared by all parallel requests in that run.** This mirrors a server where one agent object serves every request. Isolation must come from the context, not from creating a new agent per request.
- **Instructions are built only from validated context values.** The context values come from enums, so learner text never becomes instructions, and there is no prompt-injection surface in the settings.
- **Capture.** The instructions function records what it resolved into a per-run `Map<requestId, instructions>`. Offline, the scripted model also records the system prompt it actually received, and the check confirms the two agree.
- **Parallelism is provable.**
  - Offline delays run in reverse order, so finish order differs from start order.
  - The result records start and finish times, and the `parallel` check requires every request to overlap.
- **Answers are checkable in both modes.**
  - Each persona has a unique sign-off name.
  - Instructions require ending with `— <Name>` and copying the formatted total verbatim.
  - Checks compare after normalizing Intl's non-breaking spaces.
- **Anti-pattern.** The anti-pattern runs inside the run's closure, as simulated module state, so it cannot affect other learners. With `shared-module-state` the run succeeds but the isolation checks fail. That failure is the lesson.

## Risks

- A live model may ignore the sign-off or reformat the total. The checks report this per request. The instructions are explicit, and the gpt-5-mini live check passed.
