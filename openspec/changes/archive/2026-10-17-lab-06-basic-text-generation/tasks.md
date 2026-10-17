# Tasks

## 1. Implementation

- [x] 1.1 Shared agent logger kit and lab registration script
- [x] 1.2 Lab 06 run (generate, metadata, fallback, fault injection), definition, fixtures — verify lab06.test.ts and conformance

## 2. Platform hardening found while verifying

- [x] 2.1 Live provider test suites (lab runner + HTTP/SSE API + Playwright browser), opt-in via `npm run test:live` and `npm run test:e2e:live` — verify against real OpenAI and Anthropic keys
- [x] 2.2 E2E on the production topology (API serves built web via WEB_DIST_DIR); Vite proxy keep-alive; lab-01 compiler moved to a child process; SSE without manual Connection header — verify e2e

## 3. Verification

- [x] 3.1 `npm run verify` and `npm run test:e2e`

## Workflow follow-up

- Archive and commit.
