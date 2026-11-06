# Design

## Context

See proposal.md. Root concurrently launches npm workspace watches; Vite currently uses API_PROXY_TARGET or loopback port 8787. The API loads apps/api/.env or root .env and validates server settings. Existing tooling uses npm_execpath plus process.execPath for shell-free Windows-compatible npm subprocesses.

## Goals / Non-Goals

Gate only the combined development command and retain direct workspace commands for advanced use. Preserve all lab registrations and production API behavior. This change does not optimize the full runtime import graph or add browser retries after an API restart.

## Decisions

- Add a root development-web wrapper and use concurrently --kill-others for coordinated lifetime. A fixed delay cannot account for cold imports; a readiness endpoint can. Initial combined-command trials stalled in the source loader beyond 120 seconds even though a standalone source start completed in about 33 seconds. Use the existing tsup configuration in watch mode for API src and all shared packages, launching Node on each successful build. This retains rebuilding and avoids runtime TypeScript-loader overhead. Installed tsup 9.0.0 watch, restart and process-cleanup behavior was inspected locally.
- Poll /api/ready for a ready JSON response for at most 120 seconds, with per-request timeouts and abort support. Suppress expected connection errors while waiting; emit a sanitized actionable error on expiry.
- Select only HOST, PORT and API_PROXY_TARGET from the effective API dotenv file using Node's parser on filtered lines. Real environment variables take precedence. Pass only the resolved API_PROXY_TARGET to the Vite subprocess, not the parsed dotenv object. Wildcard bind addresses resolve to loopback for client connections.
- Launch npm through npm_execpath with inherited stdio and no shell, and relay cancellation. Existing concurrently owns descendant cleanup across operating systems.
- Validate API configuration and log initialization before dynamically importing the full application, so a cold import has an observable startup stage. Strip the shared server-secret keys and their mounted-file paths from the web subprocess environment, including credentials inherited from the shell.

## Risks / Trade-offs

- Cold initialization still takes time: report the wait before showing the browser URL.
- Broken configuration leaves the watcher waiting for edits: the wrapper times out and terminates the group instead of waiting indefinitely.
- Direct web workspace startup intentionally bypasses the gate; document the combined command as the learner entry point.

## Migration Plan

No data migration or package installation needed. Restart npm run dev. Revert the root script and wrapper to roll back.
