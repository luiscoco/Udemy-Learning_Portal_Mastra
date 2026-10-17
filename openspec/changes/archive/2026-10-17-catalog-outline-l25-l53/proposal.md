# Proposal

## Why

The owner pasted the course outline for L24–L53. The catalog still shows "title pending" for L25 onwards and for Modules 06–15. Navigation and lesson pages should show the real titles as soon as they are known. The labs stay locked until each one is implemented.

## What Changes

- **Confirmed titles for L25–L53** in `packages/lab-catalog/src/labs.ts`:
  - L25 Observational memory
  - L26 First typed workflow
  - L27 Sequential steps
  - L28 Parallel branches
  - L29 Conditional branching
  - L30 Foreach processing
  - L31 Nested workflows
  - L32 Suspend and resume
  - L33 Human approval
  - L34 Long-running reliability
  - L35 Business process capstone
  - L36 Document ingestion
  - L37 Chunking strategies
  - L38 Embeddings and store
  - L39 Vector retrieval
  - L40 RAG question-answering agent
  - L41 Metadata filters
  - L42 Hybrid search
  - L43 Reranking
  - L44 Citation-aware generation
  - L45 RAG quality evaluation
  - L46 Connect MCP server
  - L47 Discover MCP tools
  - L48 MCP resources and prompts
  - L49 Expose Mastra over MCP
  - L50 Multi-server MCP agent
  - L51 Two collaborating agents
  - L52 Agent handoffs
  - L53 Supervisor pattern
- **Confirmed module titles:**
  - 06 Workflow Foundations
  - 07 Advanced Workflows
  - 08 RAG and Knowledge Systems
  - 09 Advanced RAG
  - 10 Model Context Protocol
  - 11 Multi-Agent Architectures
- L54–L75 and Modules 12–15 stay "title pending".
- Lab ids, routes, order and availability are unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `lab-catalog`: outline titles through L53

## Impact

`packages/lab-catalog` (titles only) and its tests. No API or web code changes.
