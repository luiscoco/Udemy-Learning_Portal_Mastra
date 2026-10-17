# course-labs/lab-11-first-custom-tool Specification

## Purpose
Lab 11: a deterministic createTool order-total calculator registered on an agent and Mastra, with a visible tool trace.

## Requirements

### Requirement: Deterministic order-total tool
Lab 11 SHALL provide a Mastra tool that computes line totals, subtotal, discount, tax and total in integer cents with half-up rounding, validated by Zod input and output schemas.

#### Scenario: Example cart
- **WHEN** the cart is 3 × 450 ¢ and 4 × 125 ¢ with 10 % discount and 8 % tax
- **THEN** the tool returns subtotal 1850, discount 185, tax 133 and total 1798 cents

### Requirement: Registered and invoked via an agent
The tool SHALL be registered on the agent and the Mastra instance, and the agent SHALL call it; the timeline SHALL show a `tool-start` with the arguments followed by a `tool-finish` with the result, and the final answer SHALL quote the tool's total.

#### Scenario: Visible tool call
- **WHEN** the example runs offline
- **THEN** a `tool-start` for `calculateOrderTotal` precedes its `tool-finish` with `totalCents` 1798 and all checks pass

#### Scenario: Lookup by id
- **WHEN** the Mastra instance is created
- **THEN** `mastra.getToolById("calculate-order-total")` returns the tool
