## ADDED Requirements

### Requirement: Configuration doctor
Lab 72 SHALL validate a learner-edited deployment configuration with the platform's own deployment rules, report every problem by key without echoing secret values, show where each secret comes from, and evaluate readiness checks against real dependencies with optional simulated failures.

#### Scenario: Missing production secret
- **WHEN** the learner validates a production configuration without AUTH_SESSION_SECRET
- **THEN** the result names AUTH_SESSION_SECRET and its _FILE alternative as missing and reports the configuration as refused

#### Scenario: Real-looking key pasted
- **WHEN** the learner pastes a value that looks like a real provider key
- **THEN** the input is rejected and the value is not stored or echoed
