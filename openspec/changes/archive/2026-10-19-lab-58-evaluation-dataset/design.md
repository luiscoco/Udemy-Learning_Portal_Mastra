# Design

## Context

Verified in spikes with `@mastra/core` 1.78.0 and `@mastra/libsql` 1.26.2:

- **Datasets work with in-memory and with `LibSQLStore` storage.** `mastra.datasets.create({ id, name, description, metadata, targetType, targetIds })`, `get({ id })` (throws "Dataset not found"), and `Dataset.addItem({ externalId, input, groundTruth, metadata })`, `updateItem({ itemId, … })`, `listItems()`, `getItemHistory({ itemId })`, `listVersions()`, `getDetails()` (`version`, `metadata`), `update({ metadata })`.
- **Versions.** Every item mutation creates a new dataset version (add → 1, add → 2, update → 3), and items carry `datasetVersion`. A metadata update does **not** create a version.
- **Identity.** Re-adding an item with the same `externalId` and the same payload is **idempotent** (no new version). A different payload throws "One or more dataset item identities conflict with previously accepted items", so revisions must use `updateItem`.
- **Duplicate ids.** `create({ id })` with an existing id logs a SQLite UNIQUE error instead of throwing. The lab therefore calls `get` first and creates only on "Dataset not found".
- **Experiments.**
  - `dataset.startExperiment({ version, targetType: 'agent', targetId, scorers, maxConcurrency })` returns `{ experimentId, status, totalItems, succeededCount, failedCount, skippedCount, completedWithErrors, startedAt, completedAt, results: [{ itemId, itemVersion, input, output, groundTruth, error, startedAt, completedAt, retryCount, scores: [{ scorerId, score, reason, error, notScorable }] }] }`.
  - Pinning `version` to an older value runs that version's item contents.
  - `dataset.listExperiments()` lists the run with its `datasetVersion`.
- **Scorer input for agent targets.** `run.input` is `{ inputMessages, rememberedMessages, systemMessages }`, and `run.output` is an array of assistant messages whose `content.content` holds the text. A `task` target passes its return value instead.
- **Mock provider.** Output messages carry `content.metadata.provider` (`mlp-offline` for the scripted model), which proves offline runs made no external call.
- **Persistence.** A new Mastra instance on the same LibSQL file sees the dataset, its items and versions.

## Decisions

- **Seed** (`scenarios.ts`): `SEED_REVISIONS = [{ revision: 1, ops: [add ×3] }, { revision: 2, ops: [add out-of-scope, update tool-validation] }]`.
  - `ensureDataset(mastra)`: `get` or `create` with `metadata { seedRevision: 0, revisionVersions: {} }`. Then, for each revision above `seedRevision`, it applies the ops (add with `externalId`; update via the item found by `externalId`) and records `revisionVersions[revision] = details.version`.
  - Everything runs under a `KeyedLock` on the database file, so concurrent lab runs never seed or run on the same file at once.
- **Assertions** (`groundTruth`): `{ rubricId: string | null, minScore: number | null, mustMention: string[], mustNotMention: string[] }`. Phrases are matched with the L57 tokeniser (stemmed contiguous phrases).
- **Scorers** (`scorers.ts`):
  - `rubric` = `createRubricScorer({ answerOf: answerText, rubricOf: (gt) => RUBRICS[gt.rubricId] })`, which is not scorable when the scenario has no rubric;
  - `assertions` = a createScorer with preprocess (the answer text), analyze (each assertion → `{ id, label, passed, detail }`, with minScore computed with the same rubric scorer), score = passed / total, and a reason listing every assertion.
  - An item passes when every assertion passes.
- **Target agent** `faq-agent`: instructions to answer Mastra questions from `search_sources` and to reply "I only answer questions about Mastra." otherwise. The offline script returns that refusal when the question has no course topic term, else the L56 researcher script (search, then first sentences with source ids).
- **Reproducibility:** after the main experiment, run the same version again offline (always the mock model) and compare `[externalId, passed, scores]` per item. Live outputs vary, so the comparison uses the offline replay, labelled as such.
- **Provenance.** The experiment summary's `output` carries no provider, so a third deterministic scorer, `answer-provenance`, reads `content.metadata.provider` from the messages it receives and reports it in its reason. The offline lab models report `offline-sim` (now exported as `OFFLINE_PROVIDER` from `services.ts`). `mlp-offline` is only the default of a bare `ScriptedLanguageModel`.
- **Findings.** Offline, the scripted answers pass 3 of 4 scenarios at the latest revision: suspend-resume misses "resume", because the script quotes only the first sentence of the source. Live gpt-5-mini passed 4 of 4 (provider `openai`, 12 s), and the offline replay matched.
- **Contract** `EvalReportSchema` (`packages/contracts/src/eval-report.ts`):
  - `dataset { id, name, version, seedRevision, revisionVersions, versions[{ version, createdAt }] }`;
  - `experiment { id, datasetVersion, revision, status, targetId, provider, startedAt, completedAt, durationMs }`;
  - `items[{ itemId, externalId, itemVersion, input, answer, scores[{ scorerId, score, reason, notScorable }], assertions[{ id, label, passed, detail }], passed, durationMs, error }]`;
  - `summary { total, passed, failed, errored, passRate }`.

  The web `EvalReport` renders a summary, the version history and a per-item table with expandable details.
