# course-labs/lab-17-request-context Specification

## Purpose
Lab 17 teaches passing validated tenant, user and request metadata through Mastra's RequestContext: server-built allowlisted context, strict agent and tool context schemas, and tenant-scoped tools that ignore prompt injection.

## Requirements

### Requirement: Allowlisted request context
Lab 17 SHALL build the request context on the server from verified claims and an allowlist of client headers, validate it with a strict schema, and reject every other key with a reported reason.

#### Scenario: Example request
- **WHEN** the example runs with claims `{ tenantId: acme, userId: u-1001, plan: pro }` and headers including `x-tenant-id`, `x-role` and `mastra__resourceId`
- **THEN** the agent and the tool see exactly `tenantId`, `userId`, `plan`, `locale`, `requestId`, with tenant `acme`, and the three extra headers are reported as rejected

#### Scenario: Reserved key
- **WHEN** a client header is a Mastra reserved key such as `mastra__resourceId`
- **THEN** it is rejected with reason `reserved Mastra key`

#### Scenario: Invalid claims fail closed
- **WHEN** the claims contain an invalid tenant id
- **THEN** the run fails with `VALIDATION_FAILED` and no model call is made

### Requirement: Injection ignored
The invoice tool SHALL take the tenant only from the request context, so instructions in the user message cannot change the tenant.

#### Scenario: Injection attempt ignored
- **WHEN** the message tells the agent to act for tenant `globex` and the model passes `tenantId: "globex"` to the tool
- **THEN** the tool input has no `tenantId`, the tool returns only `acme` invoices and the answer contains no `globex` invoice
