# course-labs/lab-45-rag-quality-evaluation Specification

## Purpose
Define the RAG quality evaluation lab: reproducible retrieval hit rate, context relevance, answer faithfulness, abstention and answer rate over a visible fixture dataset, with declared gates and a summary recomputed from per-item scores.

## Requirements

### Requirement: Reproducible RAG quality metrics
Lab 45 SHALL evaluate the RAG pipeline on a visible fixture dataset with retrieval hit rate, context relevance, answer faithfulness and abstention, computed by deterministic Mastra scorers.

#### Scenario: Baseline suite
- **WHEN** the example runs offline (hybrid retrieval, faithful model)
- **THEN** each metric reports its mean with n and the not-scorable count; the gates pass; re-scoring the stored outputs and re-running the suite give identical numbers

#### Scenario: Weaker retrieval
- **WHEN** retrieval is `keyword-only`
- **THEN** the hit rate drops below its gate on the paraphrased items, and the gate check fails with the numbers

#### Scenario: Unfaithful generation
- **WHEN** the offline model is sloppy
- **THEN** answer faithfulness drops below its gate

### Requirement: No unverifiable quality claims
Every reported number SHALL be derivable from the visible per-item results.

#### Scenario: Summary verified
- **WHEN** the summary is produced
- **THEN** every number in it equals the value recomputed from the item scores, and every item shows its inputs, outputs and per-metric reason
