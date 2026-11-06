# Design

## Context

The registry contains 76 entries: 63 already support live mode and 13 intentionally model-free lessons do not. The screenshot is lab 01. Local .env is offline with OpenAI and Anthropic keys present; values were not displayed. Agent.generate, abortSignal and modelSettings are supported by installed @mastra/core 1.79.0 declarations, existing lab implementations and the official generate reference.

## Goals / Non-Goals

Offer a meaningful real-model extension without rewriting the practical labs or claiming that real local compiler/protocol exercises are mock framework APIs. Keep initial offline selection and committed configuration defaults. Do not add arbitrary student-code execution, remote MCP URLs, sandboxing or cloud deployment.

## Decisions

- A shared metadata adapter adds Live, optional liveModelId selection, a lesson-specific prompt, clear cost/data disclosure, guide text and shared Source entries. Each affected definition explicitly applies it.
- A shared execution adapter retains the lab's own input/output schemas and validation, adding optional checkpoint input/output through intersections. Each affected run module explicitly exports its wrapped implementation. Offline returns the original result; Live retains the core exercise and adds a bounded provider-backed explanation and structural completion check.
- Resolve the selected or automatically configured model through the existing server model service before running expensive work. Respect the scaffold's provider selection when possible; never substitute a scripted model for a live failure. Generation uses one step, no tools, capped output and the run abort signal.
- Bound and redact result evidence before sending it. Treat it as untrusted data in model instructions and expose the answer as text. Retain fixture/source labels and state that the checkpoint does not certify teaching-answer correctness or contact a remote tool deployment.
- Keep all existing 63 live implementations intact. Change only the user's ignored MASTRA_MODE setting to live; keys remain server-only and no settings are committed with credentials.

## Risks / Trade-offs

- Live adds provider charges and transfers a bounded result excerpt: disclose both and keep Offline selected initially.
- Provider nondeterminism: objective checking establishes successful completion and nonempty text, not semantic grading.
- Model/provider errors must stay visible as errors; no fallback success. Offline contract coverage and simulated provider fixtures keep CI independent of paid services.
- A running API must reload configuration: normal watched code rebuilds do so; document a root-command restart if it was stopped.

## Migration Plan

Optional additive inputs/results require no stored-data migration. Existing live labs, IDs and registry order are preserved. Roll back adapters and local mode if needed.
