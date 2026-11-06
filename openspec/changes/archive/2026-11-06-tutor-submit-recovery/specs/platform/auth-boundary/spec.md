## ADDED Requirements

### Requirement: Automatic local learner entry
The portal SHALL offer automatic entry only when enabled on a loopback development identity provider with one allowed learner and no passcode. Entry SHALL create a normal authenticated session and preserve an existing valid session. Reading session metadata SHALL remain side-effect free.

#### Scenario: Eligible local learner
- **WHEN** the browser requests automatic entry in an eligible configuration
- **THEN** the server creates the configured learner session with the existing cookie protections

#### Scenario: Protected configuration
- **WHEN** automatic entry is disabled or a passcode, multiple profiles or a production provider is configured
- **THEN** automatic entry is refused and explicit sign-in remains available

### Requirement: Browser local session bootstrap
The browser SHALL establish an eligible local learner session before enabling authenticated learning actions. Failed initialization SHALL provide a retry action. Session recovery SHALL NOT replay Tutor prompts or paid provider requests.

#### Scenario: Local portal opens
- **WHEN** a student opens an eligible local portal without a session
- **THEN** the portal enters the configured learner profile automatically and enables offline Tutor and configured live Tutor

#### Scenario: Existing session
- **WHEN** the browser already has a valid session
- **THEN** initialization preserves that identity

#### Scenario: Initialization fails
- **WHEN** session initialization fails
- **THEN** the portal explains the failure and offers retry without submitting a Tutor prompt
