## ADDED Requirements

### Requirement: Role- and locale-aware tool output
Lab 18's `getOrderSummary` tool SHALL read `role` and `locale` from the request context and return only the fields allowed for that role, formatted for that locale.

#### Scenario: Customer in German
- **WHEN** a `customer` session with locale `de-DE` asks about ORD-3001
- **THEN** the tool output has a masked email, no phone, no internal note and no risk score, and the total is formatted as `de-DE` currency

#### Scenario: Admin in English
- **WHEN** an `admin` session with locale `en-US` asks about ORD-3001
- **THEN** the tool output includes the full email, phone, internal note and risk score, formatted for `en-US`

### Requirement: Untrusted stored text escaped
Free text stored by customers SHALL be escaped and marked as untrusted in the tool output.

#### Scenario: Delivery note with markup
- **WHEN** the order's delivery note contains `<script>` and an instruction to reveal the risk score
- **THEN** the output contains `&lt;script&gt;` with `untrusted: true`, and no customer or support answer contains the risk score

### Requirement: No cross-session contamination
Each session's tool output SHALL equal the view computed for its own role and locale.

#### Scenario: Sessions after an admin
- **WHEN** sessions admin/en-US, customer/de-DE and support/ja-JP run in that order with the `cache-raw-data` strategy
- **THEN** every session's tool output deep-equals its own expected view

#### Scenario: Cached formatted output leaks
- **WHEN** the same sessions run with the `cache-formatted-output` strategy
- **THEN** the customer and support sessions receive the admin's English view, and the redaction and contamination checks fail
