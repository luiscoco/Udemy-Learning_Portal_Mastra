# Proposal

## Why

Advanced RAG starts with narrowing *what may be searched* before anything is ranked or synthesised:
- **Tenant:** one customer must never see another customer's documents.
- **Tags:** customers must not see internal notes.
- **Dates:** the policy in force on a given day, not a superseded version.

Mastra supports metadata filters on vector queries, and its vector query tool can take a server-injected filter through `requestContext`. Learners need to see how to build a safe filter, how filters fail (silently or by leaking), and how to prove isolation instead of assuming it.

## What Changes

- **New lab `lab-41`** (Module 09) over a fictional two-tenant corpus (`acme`, `globex`), indexed in libSQL with per-record metadata:
  - `tenantId`;
  - `tags`, an array such as `policy`, `refunds`, `shipping`, `internal`, for topical filters;
  - `visibility` (`public` or `internal`), a single-valued audience field;
  - `effectiveFrom` / `effectiveTo` as `YYYYMMDD` numbers. Acme has a 2025 refund policy (14 days) superseded by a 2026 one (30 days).
- **Cases.** Each case is `{ tenant, role, question, asOf?, tags?, expect }`. The **tenant and role come from the session**, never from the question. The filter is built server-side:
  - `{ $and: [ { tenantId: { $eq: tenant } }, role visibility, date window, learner filter ] }`;
  - customers see `visibility: public` only; staff see `public` and `internal`;
  - the date window is `effectiveFrom ≤ asOf ≤ effectiveTo`.
- **Execution.** The filter is passed to Mastra's `createVectorQueryTool` via `requestContext`, which overrides any filter the model sends. Synthesis is extractive: the best sentence of the top hit, with its source.
- **Learner filters are validated** with an allowlist of fields (`tags`, `effectiveFrom`, `effectiveTo`) and operators (`$eq`, `$in`, `$all`, `$gte`, `$lte`, `$gt`, `$lt`). A filter that mentions `tenantId`, uses `$or` / `$not`, or uses an unknown operator is rejected with `FILTER_REJECTED`.
- **Defence in depth.** After retrieval, every hit's `tenantId` is compared with the session tenant. A mismatch is counted as a **leak**.
- **Contrast `tenantScoping`:**
  - `request-context` (default, enforced);
  - `model-filter`: the model decides the filter. Simulated: it takes the tenant named in the question, so a cross-tenant question leaks;
  - `none`: no tenant filter at all.
- **Checks:**
  - `no-cross-tenant-results`;
  - `filter-fixtures-pass`;
  - `dates-respected`;
  - `roles-respected`;
  - `unsafe-filters-rejected`.

## Capabilities

### New Capabilities

- `course-labs/lab-41-metadata-filters`

### Modified Capabilities

(none)

## Impact

`packages/labs/src/lab-41/`. Reuses L38 embedders and `withVectorStore`. Offline is free; live embeds the corpus and questions (a few hundred tokens).
