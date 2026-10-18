## ADDED Requirements

### Requirement: Reliable recall under concurrent runs
Concurrent L24 runs SHALL each recall their own older fact when they share the libSQL vector file.

#### Scenario: Waves of concurrent runs
- **WHEN** three waves of 8 L24 runs start at the same time on one vector file
- **THEN** every run passes its checks, and each run removes the vectors it wrote when it finishes
