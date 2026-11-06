## Why
The owner found Ask Tutor disabled in both modes because they had not signed in. The local Udemy portal should enter the single learner profile automatically, while preserving the existing authenticated API and protected configurations.

## What Changes
- Bootstrap a normal local learner session automatically when the server uses the loopback-only development provider, one allowed profile and no passcode.
- Expose additive automatic-entry metadata and a typed explicit local-session endpoint; preserve existing valid sessions.
- Default automatic local entry on, with an opt-out setting. Password, passcode and multi-profile configurations retain explicit sign-in.
- Show local learner identity in the header and actionable session/loading/error feedback in Tutor; keep offline/live model and cost rules intact.
- Verify automatic entry and Tutor availability across the course without bypassing account, origin, ownership or provider protections.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `platform/auth-boundary`: eligible automatic local learner sessions and browser bootstrap/recovery.

## Impact
Authentication contract/client/API/config, browser session initialization and tutor/session UI, tests and student/auth docs. No dependencies, Mastra runtime changes, media regeneration or progress migration. Current local config was checked: dev, one profile, no passcode, loopback host.
