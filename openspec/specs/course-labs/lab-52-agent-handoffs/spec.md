# course-labs/lab-52-agent-handoffs Specification

## Purpose
Define the Agent handoffs lab (L52): route a customer request from a triage agent to the right specialist through an orchestrator that accepts or refuses every handoff, gives each specialist only the fields it needs, and stops cycles and endless transfers.

## Requirements

### Requirement: Explicit triage-to-specialist handoff
Lab 52 SHALL route a customer request from a triage agent to one specialist agent through an orchestrator that accepts or refuses each handoff, and SHALL give the specialist only the packet fields it requires.

#### Scenario: Billing request
- **WHEN** the example (a duplicate charge for order ORD-7781 from customer C-1042, with a card number in the message) runs offline
- **THEN** the billing specialist resolves it after `lookup_invoice` with order ORD-7781, its packet holds only `customerId`, `orderId` and `summary`, and neither the card number nor the raw message appears in any specialist prompt

#### Scenario: Misroute recovered
- **WHEN** the routing fault is `misroute`
- **THEN** the wrong specialist transfers the case, the correct specialist resolves it in the second hop, and the transcript marks the override as injected

### Requirement: Bounded routing
The orchestrator SHALL refuse a handoff to an agent that already handled the case or beyond `maxHops`, and SHALL escalate to a human instead.

#### Scenario: Ping-pong
- **WHEN** the routing fault is `ping-pong`
- **THEN** the handoff back to an agent that already handled the case is refused as a cycle, the case is escalated, and no more than `maxHops` handoffs are accepted

#### Scenario: Missing required context
- **WHEN** the request has no customer id
- **THEN** the handoff is refused for the missing `customerId` and the case is escalated
