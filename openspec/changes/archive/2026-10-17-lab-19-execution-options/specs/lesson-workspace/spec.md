## ADDED Requirements

### Requirement: Conditional inputs in the Run tab
The Run tab SHALL render only the fields and select options whose `visibleWhen` condition holds for the current values, SHALL NOT submit hidden fields, and SHALL replace a selected option that becomes hidden with the first visible option.

#### Scenario: Field hidden
- **WHEN** the learner selects a model for which `temperature` is not visible
- **THEN** the temperature control disappears and the submitted input has no `temperature`

#### Scenario: Option becomes hidden
- **WHEN** the selected option of a select field becomes hidden after another field changes
- **THEN** the select switches to its first visible option
