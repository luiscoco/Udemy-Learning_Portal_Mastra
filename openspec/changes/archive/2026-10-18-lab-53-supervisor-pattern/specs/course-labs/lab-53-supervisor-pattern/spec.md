## ADDED Requirements

### Requirement: Supervisor dispatching under a budget
Lab 53 SHALL run a supervisor agent that delegates research, planning and analysis tasks to three worker agents through Mastra's native sub-agent delegation, and SHALL accept or refuse every delegation against a delegation cap, a per-worker cap and a token budget.

#### Scenario: Normal dispatch
- **WHEN** the example runs offline with the default budget
- **THEN** the researcher, planner and analyst each run once, every decision is in the audit with its budget snapshot and usage, and the supervisor's final answer combines the three results

#### Scenario: Token budget reached
- **WHEN** the token budget is smaller than the first worker's usage
- **THEN** later delegations are refused with reason `token-budget` and the audit shows the spent tokens

### Requirement: Audited cycle limits
The supervisor SHALL NOT run the same delegation twice and SHALL stop at its iteration cap.

#### Scenario: Repeated delegation
- **WHEN** the fault is `repeat-delegation`
- **THEN** the repeated research delegation is refused as `duplicate` and recorded in the audit

#### Scenario: Runaway supervisor
- **WHEN** the fault is `runaway`
- **THEN** further delegations are refused by the caps, the supervisor stops at `maxIterations` steps, and the run is reported as `stopped` with the partial results
