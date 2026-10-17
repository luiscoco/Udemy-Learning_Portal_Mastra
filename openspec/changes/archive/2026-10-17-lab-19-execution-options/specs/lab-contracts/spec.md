## ADDED Requirements

### Requirement: Conditional input visibility
Input fields and select options MAY declare `visibleWhen: { field, in }`, meaning they are shown only while the named earlier field's value is one of `in`. The lab definition contract SHALL reject a `visibleWhen` that references an unknown field, a later field or the field itself.

#### Scenario: Valid reference
- **WHEN** a definition declares `temperature` with `visibleWhen: { field: "modelId", in: ["openai/gpt-4o-mini"] }` after a `modelId` field
- **THEN** the definition parses

#### Scenario: Unknown field
- **WHEN** a field's `visibleWhen.field` names a field that does not exist
- **THEN** parsing fails with a message naming the missing field
