## ADDED Requirements

### Requirement: Browser response and transport protection
API-served responses SHALL include a content security policy and browser headers that restrict script sources, framing, MIME sniffing and unnecessary device permissions while preserving supported course UI behavior. Strict transport security SHALL be sent only on trusted HTTPS requests. An explicit HTTPS-required option MUST refuse insecure application requests without redirecting credentials, while local HTTP remains compatible by default. Health/readiness GET probes are exempt.

#### Scenario: Serve a course workspace
- **WHEN** the bundled application serves a workspace, API response or error
- **THEN** security headers are present and same-origin course scripts, styles, audio and SSE continue to work

#### Scenario: HTTPS enforcement behind a trusted proxy
- **WHEN** HTTPS-required mode is enabled and a trusted proxy reports HTTPS
- **THEN** the request is accepted with transport protection, while an insecure request is refused

### Requirement: Explicit cross-origin policy
The API SHALL validate an optional single trusted origin and authorize credentialed cross-origin responses and preflights only for that exact origin. Other origins MUST NOT receive permissive CORS headers or bypass unsafe-request origin checks. Preflight methods and headers SHALL be allowlisted, and proxy trust SHALL remain explicit.

#### Scenario: Allowed origin request
- **WHEN** a browser sends a permitted preflight and then an authenticated request from the configured origin
- **THEN** the preflight and response include exact credentialed origin headers and normal authentication/ownership rules still apply

#### Scenario: Untrusted origin or header
- **WHEN** an untrusted origin or unsupported preflight header is presented
- **THEN** the request is refused without permissive CORS headers or executing an action

### Requirement: Durable deployment presets
Maintained deployment examples SHALL enable persistent sessions and execution records with separate stable secret files and a persistent data directory. Secret generation SHALL avoid overwriting existing keys and use owner-only file permissions where supported. Examples MUST preserve local-only defaults or explicitly configured HTTPS proxy boundaries.

#### Scenario: Generate local container secrets twice
- **WHEN** the operator generates secrets again for an existing deployment
- **THEN** existing signing and journal keys remain unchanged and no secret value is logged except the newly generated login password shown once
