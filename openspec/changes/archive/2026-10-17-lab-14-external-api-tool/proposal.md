# Proposal

## Why

Tools that call third-party HTTP APIs introduce outages, rate limits, slow responses and untrusted data. Learners must build such a tool safely on the server and test it offline.

## What Changes

- New lab `lab-14` (Module 03): `get-current-weather` tool calling the free Open-Meteo API (no key).
- Safety: host allowlist (`api.open-meteo.com`), URLs built server-side from a fixed city table (the model only picks a city), `AbortSignal.timeout`, bounded body size, no redirects, Zod response validation, per-run client-side rate limiter; failures returned as typed errors (`TIMEOUT`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `BAD_RESPONSE`, `NOT_ALLOWED`, `NETWORK`) instead of thrown.
- Transport abstraction: local mock with data recorded from the real API and fault injection (timeout, 429 with Retry-After, 503, broken JSON); or the real network client.

## Capabilities

### New Capabilities

- `course-labs/lab-14-external-api-tool`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-14/`. Mock = free and offline; Open-Meteo = free, needs internet; live model adds two model calls.
