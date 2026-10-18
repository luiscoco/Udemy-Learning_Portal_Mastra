## ADDED Requirements

### Requirement: Server-built metadata filters before synthesis
Lab 41 SHALL filter vector retrieval by tenant, role tags and effective dates using a server-built filter passed to Mastra's vector query tool through `requestContext`, before any answer is synthesised.

#### Scenario: Filter fixtures pass
- **WHEN** the example cases run (both tenants, customer and staff roles, a past date)
- **THEN** each case's top hit is the expected document: Acme's 2026 refund policy today, its 2025 policy for a 2025 date, Globex's own policy for Globex, and internal notes only for staff

#### Scenario: Cross-tenant question
- **WHEN** an Acme session asks for Globex's refund policy
- **THEN** only Acme documents are returned, and the leak check reports zero cross-tenant results

### Requirement: Cross-tenant retrieval forbidden
No retrieval SHALL return another tenant's documents, and unsafe learner filters SHALL be rejected.

#### Scenario: Unsafe learner filter
- **WHEN** a learner filter mentions `tenantId`, or uses `$or` or an unknown operator
- **THEN** the case is rejected with `FILTER_REJECTED` before any query runs

#### Scenario: Model-chosen filter
- **WHEN** `tenantScoping` is `model-filter` and the question names the other tenant
- **THEN** the other tenant's documents are returned, the leak check counts them, and `no-cross-tenant-results` fails
