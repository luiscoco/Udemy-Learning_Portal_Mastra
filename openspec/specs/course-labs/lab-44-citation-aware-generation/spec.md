# course-labs/lab-44-citation-aware-generation Specification

## Purpose
Lab 44 generates answers as claims with per-claim citations, blocks claims whose citations do not match their sources, and renders answers in the Run tab with citations that open the source passage with the quote highlighted.

## Requirements

### Requirement: Per-claim citations
Lab 44 SHALL generate answers as claims, each with citations to the retrieved source passages, and verify every citation before showing the claim.

#### Scenario: Grounded multi-source answer
- **WHEN** the example asks "My card was declined and I want a refund: what should I do?"
- **THEN** the shown claims cite err-4012 and refunds, every quote appears verbatim in its passage, and every number in a claim appears in its quotes

### Requirement: Unmatched citations blocked
Claims whose citations do not match a provided source SHALL be blocked and listed with their reasons.

#### Scenario: Sloppy model
- **WHEN** the model adds a claim citing an unknown source, one with a paraphrased quote, and one with a number not in its quote
- **THEN** those claims are blocked with `UNKNOWN_SOURCE`, `QUOTE_NOT_FOUND` and `UNGROUNDED_NUMBER`, and the valid claims are still shown

#### Scenario: Guard off
- **WHEN** the guard is off and the model is sloppy
- **THEN** the unmatched citations are shown, and the blocking check fails
