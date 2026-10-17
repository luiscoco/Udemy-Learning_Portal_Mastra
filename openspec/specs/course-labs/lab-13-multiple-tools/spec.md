# course-labs/lab-13-multiple-tools Specification

## Purpose
Lab 13: an agent choosing, parallelising and chaining two tools, with each call traced separately and answers grounded in results.

## Requirements

### Requirement: Tool choice and chaining
Lab 13 SHALL give an agent an inventory lookup tool and a currency formatting tool; the agent SHALL look up every SKU mentioned and format each found price using the price returned by the lookup.

#### Scenario: Two SKUs in EUR
- **WHEN** the example asks about TSH-0042 and MUG-0007 in EUR
- **THEN** two lookups run, then the found prices (1999 ¢ and 1250 ¢) are formatted as €18.39 and €11.50, and the answer contains both

### Requirement: Separately logged calls
Each tool call SHALL produce its own `tool-start`/`tool-finish` pair with a unique `toolCallId`, in a stable order offline.

#### Scenario: Stable order
- **WHEN** the example runs offline
- **THEN** the tool events are two lookup starts and finishes followed by two format starts and finishes, with four distinct ids

### Requirement: Grounded answers
Unknown SKUs SHALL be reported as not found without an invented price.

#### Scenario: Unknown SKU
- **WHEN** the question mentions ZZZ-9999
- **THEN** the answer says it was not found and no format call is made for it
