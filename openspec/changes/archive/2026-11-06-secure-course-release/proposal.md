# Proposal

## Why

The Udemy release review found three high-severity MCP dependency findings, missing HTTP security headers, deployment examples that omit durable stores, and no reproducible student download. Fix these concrete repository gaps while keeping externally supplied licensing, course recordings and hosting choices explicit.

## What Changes

- Pin and verify compatible security updates for Mastra core/MCP and the direct MCP client; update teaching templates and compatibility evidence without rewriting labs.
- Add browser security headers, validated explicit origin handling/CORS and opt-in enforced HTTPS behind configured proxies, preserving local development.
- Enable durable sessions and run records in deployment examples, using a separate generated mounted journal key and restrictive secret-file permissions.
- Provide a bounded, allowlisted course ZIP builder with hashes, a 76-entry lab/lecture resource map and a fresh-student guide. Exclude secrets, private data and generated build/test artifacts; do not assign a license without the owner's choice.
- Fix stale release documentation and verify the release artifact itself, framework compatibility, browser security behavior and full regressions.

## Capabilities

### New Capabilities

- `platform/course-distribution`: sanitized, reproducible student source archives and resource mappings.

### Modified Capabilities

- `platform/deployment`: browser response protection, explicit origin/transport configuration and durable deployment presets.

## Impact

API middleware/auth origin integration, deployment configuration/scripts, exact dependency manifests/lockfile, course tooling/docs and offline tests. No cloud deployment, license grant, account-provider enrollment or paid model calls. Hosted cost budgets, distributed state, upload isolation, off-host operations and actual course media remain separately tracked requirements.
