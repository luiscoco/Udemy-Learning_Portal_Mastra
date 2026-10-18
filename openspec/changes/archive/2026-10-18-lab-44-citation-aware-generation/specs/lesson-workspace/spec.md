## ADDED Requirements

### Requirement: Inspectable cited answers in the Run tab
The Run tab SHALL render a lab result's `citedAnswer` as claims with numbered citations that open the cited source passage with the quote highlighted.

#### Scenario: Open a source passage
- **WHEN** a learner activates citation [1] of a cited answer
- **THEN** a labelled dialog shows the source's title, location and full passage with the quoted span highlighted, and Escape or Close returns focus to the citation

#### Scenario: Unknown output shapes
- **WHEN** a result has no valid `citedAnswer`
- **THEN** the Run tab renders as before
