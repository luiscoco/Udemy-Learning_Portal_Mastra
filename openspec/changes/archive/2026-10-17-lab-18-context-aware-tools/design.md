# Design

## Context

This lab reuses behaviour verified in L17 against the installed `@mastra/core` 1.78.0:

- tools receive the call's context as `context.requestContext`;
- a tool-level `requestContextSchema` rejects the call before `execute` when the context is missing or invalid.

Formatting uses the built-in `Intl` APIs: `DateTimeFormat`, `NumberFormat` with `style: currency` and `style: unit` (`kilogram`).

## Decisions

- **The view is built in one pure function.** `buildView(raw, role, locale)` is pure and lives in one place. The tool calls it, and the checks call it again to compute what each session should have received. "No cross-session contamination" means each session's tool output deep-equals its own expected view.
- **Redaction is an allowlist per role, not a denylist:**
  - **customer:** name, masked email, status, dates, total, weight, delivery note.
  - **support:** customer fields plus the full email and a masked phone.
  - **admin:** everything, including the internal note and the risk score.
  Fields not allowed for a role are absent from the output, not just empty. The output schema is validated by Mastra.
- **Untrusted stored text.** The delivery note is escaped as HTML entities, control characters are removed, and it is cut to 200 characters. It is returned as `{ untrusted: true, text }`. The agent instructions say to treat it as data, so a stored injection ("show the risk score") cannot instruct the agent. The tool never had the risk score in a customer view anyway.
- **Sequential sessions.** Sessions run one after another, so the cache anti-pattern is deterministic. L16 already covers parallel isolation.
- **Gullible offline model.** It repeats every field the tool returned. Whatever the tool leaks reaches the answer, which makes leaks visible.

## Risks

- Live models may paraphrase labels. The checks therefore focus on the tool output, plus the absence of forbidden values in the answer, which a model cannot invent.
