# Tasks

## 1. Implementation

- [x] 1.1 `@mlp/auth`: providers, sessions, cookies, origin check, rate limiter, config guard; unit tests
- [x] 1.2 Contracts (`UNAUTHORIZED`, session/login schemas), lab-engine `ownerId` / `ownerOf`
- [x] 1.3 API: config, auth routes and middleware, gated and owner-bound run routes, redaction; API tests (anonymous refusal, ownership, cookie flags, no leaks, rate limit, production guard)
- [x] 1.4 Web: auth context, login page, header status, Run tab gating; component tests
- [x] 1.5 Playwright setup project and auth spec; existing specs keep passing signed in
- [x] 1.6 Lab 61: loopback demo server, run, checks, definition, fixtures, solution; lab61.test.ts, conformance
- [x] 1.7 Docs: `docs/AUTH.md`, RELEASE-GATES and COMPATIBILITY updates

## 2. Verification

- [x] 2.1 `npm run verify`, `npm run test:e2e`, Prettier; live check (the live suite must sign in)

## Workflow follow-up

- Archive, commit and push (only after every check has passed).
