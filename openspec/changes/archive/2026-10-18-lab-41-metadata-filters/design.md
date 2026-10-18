# Design

## Context

Verified against `@mastra/libsql` 1.26.2 and `@mastra/rag` 2.6.6 (spikes):

- **`LibSQLVector.query({ filter })` operators.**
  - `{ tenantId: 'acme' }` and `{ tenantId: { $eq: 'acme' } }` work;
  - `{ tags: { $in: ['policy'] } }` matches array fields; `$all` works;
  - numeric `$gte` / `$lte` work;
  - `$and` combines clauses;
  - **a plain value against an array field (`{ tags: 'policy' }`) matches nothing**, silently;
  - **`$or` naming another tenant returns that tenant's records**;
  - unknown operators throw `Unsupported operator: $regex`;
  - a non-existent key matches nothing.
- **`createVectorQueryTool` filter precedence.** The tool reads `filter = requestContext.get('filter') ?? inputData.filter`, and a `requestContext` filter enables filtering by itself:
  - a server filter `{ tenantId: { $eq: 'acme' } }` **overrode** a model-supplied `{"tenantId":"globex"}`;
  - it also worked with `enableFilter: false`, as an object or as a JSON string;
  - with no filter at all, both tenants were returned; with `enableFilter: true` and no server filter, the model's filter decided.
- **Tag allow-lists leak.** An allow-list of tags (`tags: { $in: [policy, faq, shipping, refunds] }`) let the internal note (tags `[internal, refunds]`) through to customers, because `$in` matches any one allowed tag. Visibility is therefore a separate single-valued field.
- **Approximate search.** libSQL searches its approximate index first and filters afterwards (`topK × 10` over-fetch, L24). A strict filter cannot leak, but it can return fewer than `topK` hits.

## Decisions

- **Corpus.** Six short fictional documents, one record each, with stable ids:
  - Acme: refunds 2025 and 2026, shipping, internal goodwill notes;
  - Globex: refunds 2026, shipping.

  Dates are `YYYYMMDD` integers; an open end is `99991231`.
- **The filter builder** (pure) produces `{ $and: [...] }` with clauses in this order: tenant (`$eq`), role visibility (`$in` of the allowed visibilities), date window (`effectiveFrom $lte asOf`, `effectiveTo $gte asOf`), then the learner filter. The tenant clause is always first and is never optional in enforced mode.
- **Learner filter validation** (pure, recursive):
  - top-level keys must be allowlisted fields or `$and`;
  - operators must be allowlisted;
  - values must be strings, numbers or arrays of them;
  - any `tenantId`, `$or`, `$not` or `$nor` is rejected with `FILTER_REJECTED` and a reason.

  A rejected case does not run its query and is reported as rejected.
- **Execution.** One libSQL file per lab (`lab-41-vectors`), with the index name derived from the embedder (`l41_<model>_<dims>`). The corpus is upserted idempotently (content ids) in each run under `withVectorStore`. Per case: `tool.execute({ queryText, topK }, { requestContext })`, with the filter in `requestContext` in enforced mode. In `model-filter` mode the tool has `enableFilter: true` and no server filter, and the simulated model passes `{"tenantId":"<tenant named in the question>"}`, or the session tenant if none is named.
- **Synthesis.** Extractive: the sentence of the top hit sharing the most keywords with the question, cited with document id and source. No model is involved, so the result is deterministic in both modes.
- **Leak check.** Every hit's `tenantId` must equal the session tenant. A mismatch is a leak, and is shown in the output with the foreign document id.
- **Checks:**
  - `no-cross-tenant-results`: zero leaks;
  - `filter-fixtures-pass`: each case's top hit equals `expect.docId`, or there are no hits for `expect: 'none'`, or the case is rejected for `expect: 'rejected'`;
  - `dates-respected`: no hit outside its effective window for `asOf`;
  - `roles-respected`: customers never get documents whose `visibility` is not `public`;
  - `unsafe-filters-rejected`: every case with an unsafe learner filter was rejected before querying.

## Risks

- **Fewer hits than requested.** Because filtering happens after the approximate search, a strict filter can return fewer than `topK` hits. This is acceptable and documented: isolation is what matters here, and the leak check holds regardless.
