# Proposal

## Why

Module 11 ends with a capstone that combines its patterns into one pipeline: a team of agents researches a question, writes a sourced synthesis, checks it and waits for a human before anything is published. The two failure modes that matter most for published research are answers whose evidence cannot be inspected and claims that the sources do not support.

The DoD asks for a multi-agent research pipeline with sourced synthesis and human approval before publishing, with answer evidence surfaced and unsupported claims flagged.

## What Changes

- **New lab `lab-55`** (Module 11): a workflow `research-team-workflow`, registered on an in-memory `Mastra` instance so it can suspend and resume, with five agent roles:
  1. `plan`: a **lead** agent splits the question into 2–3 sub-questions (structured output).
  2. `research`: `.foreach` over the sub-questions with concurrency 2. Each iteration runs its own **researcher** agent, with the L51 `search_sources` and `record_finding` tools and the verbatim-quote guard.
  3. `pool`: deterministic. It merges the findings, removes duplicate quotes and renumbers the notes 1..k.
  4. `synthesize`: a **synthesizer** agent writes the answer from the pooled notes only, citing `[n]` per sentence.
  5. `fact-check`: a **fact-checker** agent reviews every sentence against the notes (structured output). The orchestrator adds the deterministic structural check (uncited sentence, unknown citation). Each sentence becomes a claim that is either `supported` or `flagged`, with reasons.
  6. `approve`: suspends with the claims and flags. The lab bridges the pause to `ctx.requestApproval` (the Run tab approval panel) or applies a preset decision, then resumes the run.
  7. `publish`: on approval, publishes only the supported claims. Flagged claims are withheld and listed. On rejection or timeout, nothing is published.
- **Evidence surfaced.** `output.citedAnswer` uses the L44 `CitedAnswerSchema`: each published claim carries its citations with the verbatim quote and its offsets in the source text, and flagged claims are `blocked` with their reasons. The Run tab renders it with clickable citations that open the source passage.
- **Planted claim** (both modes, marked as injected): the L51 slips `uncited-claim`, `unknown-citation` and `unsupported-claim`. The default is `unsupported-claim`, so the example shows a flag.
- **Transcript.** `output.agentConversation` covers the lead, each researcher, the synthesizer, the fact-checker, the workflow and the human.
- **Checks:** `team-coordinated`, `notes-grounded`, `evidence-surfaced`, `unsupported-flagged`, `approval-before-publish`.

## Capabilities

### New Capabilities

- `course-labs/lab-55-research-team-capstone`

### Modified Capabilities

(none)

## Impact

- **Files:** `packages/labs/src/lab-55/` (reuses L51 sources, tools and grounding and L44 `locateQuote`), catalog flag, registry, COMPATIBILITY row, an e2e spec (interactive approval).
- **Modes:** offline (scripted, free) and live (one lead call, 2–3 researcher runs of up to 6 steps, one synthesis and one fact-check).
