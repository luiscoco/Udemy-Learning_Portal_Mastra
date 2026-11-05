## Why

The course delivers Labs 01–74 but has no final integrated enterprise assistant. Learners need to demonstrate that grounded answers, authenticated data access, bounded execution and approved actions work together rather than as isolated demonstrations.

## What Changes

- Deliver Lab 75 with a support/refund scenario coordinated by a typed Mastra workflow, two agents, durable tenant memory, local knowledge retrieval and a real loopback MCP integration.
- Verify citations and evaluate answer quality before permitting an explicitly simulated refund; enforce server-owned case access, approval and idempotency at the action boundary.
- Expose incremental workflow/tool events, verified citations and real tracing through existing Learn/Run/Source views.
- Add deterministic fixtures, adversarial integration tests, desktop/mobile browser scenarios and a complete instructor guide.

## Capabilities

### New Capabilities

- `course-labs/lab-75-enterprise-ai-assistant-capstone`: an integrated, bounded, tenant-scoped enterprise assistant lesson with safe simulated actions.

### Modified Capabilities

None. Existing routes, contracts and completed lessons remain compatible.

## Impact

Adds `packages/labs/src/lab-75/`, registry/catalog entries, browser tests and compatibility/demo documentation. Reuses installed dependencies and existing result visualizations. No provider calls are needed for verification; optional live model calls are billed by the configured provider. This change does not implement the separate platform-wide durability or public-host release gates.
