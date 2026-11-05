## Purpose

Define the final course capstone: an enterprise support assistant integrating grounded research, memory, MCP, approval, evaluation and monitoring in one safe end-to-end lesson.

## ADDED Requirements

### Requirement: Integrated enterprise assistant lesson
Lab 75 SHALL be available in Module 15 at its stable lab route with the complete teaching contract, editable question, case, amount, action and approval inputs, deterministic offline fixtures and optional live models. A coordinated workflow SHALL research and review an answer using two agents, retrieve tenant-owned knowledge, access a support case through MCP, persist conversation memory and show actual incremental execution and tracing evidence.

#### Scenario: Grounded support answer
- **WHEN** the learner asks an answerable policy question for an owned case
- **THEN** the lesson shows verified citations, a quality score, persisted conversation evidence, MCP tool activity and a trace of the completed workflow

#### Scenario: No evidence or invalid citation
- **WHEN** the question has no retrieved evidence or the answer contains an invalid citation
- **THEN** unsupported claims are withheld and the quality gate blocks any refund

### Requirement: Permission and approval before simulated action
The assistant SHALL enforce case ownership from server-established learner identity and SHALL perform only simulated refunds. Execution SHALL require an owned case, an eligible bounded amount, a passing quality gate and approval. Repeated requests for a refunded case SHALL not create another refund. Preset approval SHALL be identified as a teaching fixture, and interactive approval SHALL use the existing authenticated approval controls.

#### Scenario: Approved refund and repeat
- **WHEN** an eligible request passes quality checks and is approved, then the same case is requested again
- **THEN** only one simulated refund exists and the repeat returns its prior receipt without repeating the side effect

#### Scenario: Denial or foreign case
- **WHEN** approval is declined or the case is not owned by the requesting learner
- **THEN** no simulated refund is executed and foreign case contents are not disclosed

### Requirement: Bounded and observable execution
The lesson SHALL bound model steps, output tokens and tool executions, honor cancellation and deadlines, keep credentials and server paths out of results, and release MCP, memory and observability resources. Its automated checks SHALL distinguish a correctly blocked unsafe request from a failed implementation.

#### Scenario: Cancel while awaiting approval
- **WHEN** the learner cancels while a decision is pending
- **THEN** the run terminates without a refund and releases its resources

#### Scenario: Tenant separation
- **WHEN** two learners use the same thread and case identifiers
- **THEN** their conversation history and simulated refund ledgers remain isolated
