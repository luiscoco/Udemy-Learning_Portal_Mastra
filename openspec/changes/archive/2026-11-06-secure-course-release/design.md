# Design

## Context

See proposal.md. Fresh npm audit reports three high findings in the old MCP dependency chain. The registry confirms @mastra/mcp 2.8.0 requires core >=1.79 and pins MCP client/server 2.4.0 and node transport 2.1.2. Core APIs remain constrained by installed declarations and packaged official references. The API currently lacks response-security middleware; its CORS_ORIGIN setting is unused. Student setup is currently a general README, without a downloadable resource map or release archive.

## Goals / Non-Goals

Deliver a verified local student release, remedy confirmed security defects and keep optional hosting protections explicit. The owner selected local installs and delegated license choice; use MIT for original project code, retaining third-party terms. No public deployment, billing integration, OIDC enrollment, account hosting, classroom load guarantee or recorded media is promised.

## Decisions

1. Pin core 1.79.0, MCP 2.8.0 and direct MCP client 2.4.0 consistently in workspaces/templates. Inspect installed version-matched declarations/references after install and test the native adapters and all labs. Do not run blanket audit fix or bypass peers. Remove superseded vulnerability exceptions only after a fresh audit confirms the corresponding chain is fixed; retain and report real lower-severity findings.
2. Add API middleware before body parsing/auth that sends CSP (self scripts, no eval/inline scripts, self plus inline styles for React layout, self/data/blob images/audio as required), nosniff, no-referrer, deny framing, same-origin opener and restricted camera/geolocation permissions. Microphone stays self for L69. HSTS is sent only when req.secure is true, with no preload/subdomain commitment. HTTP_REQUIRE_HTTPS defaults false for local/compose compatibility; true rejects plain HTTP with a canonical error, except non-credentialed GET health/readiness probes required by container platforms. Trusted forwarding remains governed by TRUST_PROXY.
3. Validate CORS_ORIGIN as one canonical http/https origin without path, query, credentials or wildcard. No configured origin means same-origin policy without broad CORS headers. Configured origin permits only its exact Origin value, sets credentials and Vary: Origin, and handles API OPTIONS through bounded method/header allowlists. Auth accepts this explicit trusted origin in addition to its existing same-origin checks; no Origin remains allowed for CLI/SDK clients as before. This does not replace session/owner/capability checks. No cross-site cookie relaxation is introduced.
4. Update compose and Azure staging examples to durable session/journal settings and a separate run-store secret. Keep one replica. Generate new local secrets with mode 0600 and exclusive creation, retaining existing keys. Do not deploy or rotate a real secret automatically. Fix stale example comments and deployment documentation; test the local generation process and preset consistency.
5. Add fflate 0.8.2 as an exact dev-only ZIP dependency after checking its API/license. Build the archive from Git-known and explicitly allowed source/config files, including current reviewed workspace bytes and new allowlisted files; exclude private/build/test/IDE/VCS data and symlinks. Enforce file/count/total-byte limits, deterministic ZIP timestamps/order and per-file SHA256. Include a generated 76-lab map from browser-safe catalog metadata, manifest, source revision and dirty-state provenance; fixed source revision/bytes produce identical artifacts. Do not recursively copy the workspace or load provider keys.
6. Generate into ignored .data/course-release with temporary-file publication and verify ZIP contents/hashes. Add artifact policy tests that inject forbidden, symlink, oversized and traversal candidates. Exercise a fresh extracted copy with npm ci/build/start and an offline orientation run, without copying node_modules or .env. Add supported-OS release-tool CI coverage; local Windows evidence must not be represented as physical macOS/Linux verification.
7. Add MIT, student setup/update guide, instructor release checklist and course mapping artifact. Update RELEASE-GATES to distinguish completed local release work from optional hosted gates. Course recordings, captions, Udemy account uploads and real learner feedback remain owner tasks, not silently completed code features.

## Risks / Trade-offs

- Framework upgrade may expose behavior differences: run focused native tests, full verify/e2e and regression gates; adapt only verified incompatibilities.
- CSP may break renderer/voice paths: exercise diagrams, workflow views, source and microphone fallback in the production browser suite, including CSP violation monitoring.
- ZIP allowlists can accidentally omit a prerequisite: verify npm ci/build/offline execution in the actual extracted artifact and preserve every workspace package/config needed.
- Local archives do not provide credential secrecy after a student configures their own machine. Keep offline-first instructions and never ship instructor credentials.
- MIT permits broad reuse; retain third-party notices and identify separately authored media terms instead of claiming ownership of dependency code.

## Migration Plan

Local default HTTP and lab IDs/routes remain stable. Co-deploy the dependency lockfile and pinned teaching templates. Operators may enable HTTPS enforcement after validating the actual proxy; configured external browser origins must be exact and compatible with unchanged SameSite cookies. New deployment presets require a new separate journal secret; generating presets preserves existing signing keys. Existing durable databases require no schema change. No push, hosted deployment or Udemy publication occurs as part of this change.
