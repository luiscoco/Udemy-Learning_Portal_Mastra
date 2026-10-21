## MODIFIED Requirements

### Requirement: Injected tool instructions cannot cause unapproved side effects
A write tool call that the customer's own request does not authorize SHALL be denied before execution without consuming the run's write budget, an authorized write call made after untrusted content entered the context SHALL execute only after human approval, and a negated request SHALL grant nothing.

#### Scenario: Injection evades the detector
- **WHEN** a disguised injection is not flagged by the scanner and the model calls sendEmail to the attacker's address
- **THEN** the gateway denies the call before execute, the sandbox outbox stays free of it, and the audit records the denial

#### Scenario: Legitimate request after reading untrusted text
- **WHEN** the customer asked to email the summary to themselves
- **THEN** the call requires approval, is sent only if approved, and is not sent when declined

#### Scenario: Injection flood
- **WHEN** a document makes the model attempt more injected write calls than the write limit
- **THEN** every injected call is denied and the customer's own authorized action still reaches approval

#### Scenario: Negated request
- **WHEN** the customer writes "please don't email me"
- **THEN** no email capability is granted
