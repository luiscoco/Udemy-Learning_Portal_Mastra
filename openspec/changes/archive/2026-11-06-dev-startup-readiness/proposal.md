# Proposal

## Why

The API imports the full lab runtime before listening, while Vite starts in about a second. Opening the displayed URL during that interval produces ECONNREFUSED errors for health and session requests even when the API eventually starts successfully.

## What Changes

- Gate the root development web command on API readiness, with visible waiting and bounded failure diagnostics.
- Keep both watch servers and coordinate their shutdown through the existing process supervisor.
- Use the existing API bundler in watch mode for the API and shared packages to avoid the observed combined-command source-loader stalls.
- Resolve the API proxy consistently for default and configured ports without loading provider credentials into Vite.
- Cover delayed readiness, unavailable and hanging servers, configuration and cancellation; document startup troubleshooting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-foundation`: the standard development command waits for API readiness before advertising the web URL and fails clearly within a bounded interval.

## Impact

Root scripts, a development-only readiness helper, tooling tests/types and setup documentation. No new dependencies, lab contracts, runtime APIs or provider calls.
