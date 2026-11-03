# Proposal

## Why

A live check failed with the generic `INTERNAL` "Lab execution failed". The cause was the model provider rejecting the configured API key (`AI_APICallError`, HTTP 401 "invalid x-api-key"). Learners and operators cannot act on `INTERNAL`. The same is true for rate limits (429) and provider outages (5xx). The canonical codes `NOT_CONFIGURED`, `TOO_MANY_REQUESTS` and `PROVIDER_ERROR` already exist, but provider HTTP errors were never mapped to them.

## What Changes

- `toCanonicalError` recognises provider API errors: an error, or a nested `cause` / `lastError` / `errors[]` item up to depth 4, with a numeric `statusCode` between 400 and 599. It maps them to fixed, secret-free messages and never copies the provider's message:

| HTTP status | Code | Retryable | Message |
| --- | --- | --- | --- |
| 401 / 403 | `NOT_CONFIGURED` | no | "The model provider rejected the API key or its permissions (HTTP 401). Check the key in the server .env." |
| 429 | `TOO_MANY_REQUESTS` | yes | "rate limited, retry shortly" |
| 408 / 5xx | `PROVIDER_ERROR` | yes | "unavailable" |
| other 4xx | `PROVIDER_ERROR` | no | "rejected the request" |

- Unknown errors still map to `INTERNAL`.
- Unit tests in `lab-engine`.
