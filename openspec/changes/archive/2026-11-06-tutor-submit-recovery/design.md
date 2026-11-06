## Context
See proposal.md for motivation. The API already enforces authenticated ownership and the browser disables Tutor without a principal.

## Goals / Non-Goals
Provide local entry through existing sessions. Preserve protected deployments, account ownership and explicit provider-cost consent; do not bypass API authentication.

## Decisions
- Add AUTH_LOCAL_AUTO_LOGIN, default true, with strict eligibility: development provider, loopback host, one normalized learner and no passcode. Server selection avoids trusting browser-supplied identities.
- Keep GET session read-only. Add POST local-session behind existing origin checks, cookie protections and login limits. Existing sessions return unchanged.
- Add optional login.autoLocal metadata for backward-compatible contracts and a typed client method. Older servers retain explicit sign-in.
- Bootstrap and refresh through the typed client. Abort obsolete initialization during explicit account actions. Preserve explicit logout until reload; local headers identify the automatic learner.
- Show Tutor session loading/error recovery independently of provider readiness. No automatic prompt replay.

## Risks / Trade-offs
Automatic entry shares one local learner profile → restrict eligibility and document opt-out. Session initialization races → abort obsolete requests before explicit account operations.

## Migration Plan
No persistent data migration. Restart the API and web app. Set AUTH_LOCAL_AUTO_LOGIN=false to restore explicit local entry. Protected configurations retain their current behavior.
