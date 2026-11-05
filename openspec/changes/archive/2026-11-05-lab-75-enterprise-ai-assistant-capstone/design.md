## Context

See proposal.md for motivation. L70 provides tenant memory and keyword retrieval; L44 verifies cited claims; L49 provides an authenticated loopback MCP facade; L56 provides sanitized native tracing. The API already supplies authenticated tenant services and streams approvals. The course registry stops at L74. Installed packages are core 1.78.0, MCP 2.4.1 and observability 1.20.1; use their declarations and shipped/version-matched documentation, not new APIs shown only in current online docs.

## Goals / Non-Goals

**Goals:** An integrated teaching scenario with real framework execution, honest quality/safety outcomes, reproducible offline tests and optional live models.

**Non-Goals:** Real payments, external customer systems, OIDC, shared sessions or platform-wide durable progress. Existing public-host release gates remain separate.

## Decisions

1. Use a typed sequential Mastra workflow: research, review, evaluate, approve, execute. Register both agents on its Mastra instance for native tracing. Reuse result components instead of introducing another workspace contract.
2. Use keyword RAG over a fixed sample policy placed in the learner's own document library. Treat it explicitly as an app-level retrieval adapter; embeddings add no educational value to this small capstone dataset. Verify against passages retrieved in the current run, never thread history.
3. Publish only a read-only case lookup through the authenticated L49 MCP facade. The researcher receives the discovered tool. Refund execution is a deterministic app-level gateway outside the model's tool set, with ownership, amount, quality and approval checks repeated at execution. A foreign-case fixture returns only unavailable status.
4. Use durable Mastra memory per tenant/thread and a tenant-local, schema-validated, atomically written simulated ledger. Serialize runs per tenant to prevent concurrent history writes and duplicate refunds. A receipt per case prevents repeated or conflicting refunds. These local guarantees remain single-process, matching deployment limits.
5. Offline uses scripted models through the existing resolver; both research and review execute real Agent calls. Live retains the same permissions and simulation. Preset approve/decline options are labelled fixture decisions, while ask uses ctx.requestApproval.
6. A deterministic native Mastra scorer evaluates grounded-answer evidence. A zero score prevents a refund. Budget counts enforce at most six researcher model steps, one reviewer step and eight tool executions; both agents have bounded output tokens and zero retries. Persisted conversation data and a sanitized native trace make the integration inspectable.

## Risks / Trade-offs

- Live answers vary → fail closed on invalid or absent citations and report the quality result without claiming guaranteed answer success.
- Citation heuristics are not proof of entailment → teach exact-source verification and use a fixed policy for refund eligibility; never let model text authorize payments.
- In-process approval prompts and local locks do not survive failover → describe that limit explicitly; test cancellation and tenant isolation, and keep production durability work separate.
- MCP transitive advisories remain under the existing release assessment → no dependency upgrade in this lab; loopback, bearer token and read-only exposure limit its reach.

## Migration Plan

Register L75 and mark its catalog entry available after integration. New lab-owned stores are created lazily under each tenant; no existing data migration or API contract change is required. Rollback removes the registry entry and locks the catalog entry while retaining lab-owned data.
