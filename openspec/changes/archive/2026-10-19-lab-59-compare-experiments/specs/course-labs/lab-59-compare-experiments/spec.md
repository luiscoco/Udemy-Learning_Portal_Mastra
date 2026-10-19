## ADDED Requirements

### Requirement: Compare configurations on one dataset version
Lab 59 SHALL run several agent configurations as Mastra experiments on the same dataset version and SHALL compare their pass rate, mean score, tokens and latency against a baseline, with per-item regressions and improvements.

#### Scenario: Offline comparison
- **WHEN** the example runs offline with the grounded baseline, concise and no-tools configurations
- **THEN** three experiments run on the same dataset version, each configuration has a pass rate, a mean score, simulated token counts and latency percentiles, and each non-baseline configuration has deltas that equal its metrics minus the baseline's

### Requirement: No fabricated cost
The comparison SHALL show a cost only when the provider's usage reports one, and SHALL otherwise show no cost with the reason.

#### Scenario: Mock provider
- **WHEN** the configurations run on the mock provider
- **THEN** every configuration's cost is null with the reason that the provider reported no cost

### Requirement: Reproducible and exportable
The comparison SHALL be recomputable from storage with the same result, and SHALL be exported as JSON and CSV.

#### Scenario: Export
- **WHEN** a comparison completes
- **THEN** the JSON export parses back to the comparison's configurations and metrics, and the CSV has a header and one row per configuration
