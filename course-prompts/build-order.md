# Build order

Run the prompts strictly in this order, one per request. Follow-ups are marked.

| Step | Prompt | Title | Module | Kind |
| --- | --- | --- | --- | --- |
| 1 | [F01](prompts/F01-monorepo-openspec-and-developer-foundation.md) | Monorepo, OpenSpec, and developer foundation | Foundation | original |
| 2 | [F02](prompts/F02-typed-lab-contracts-engine-and-events.md) | Typed lab contracts, engine, and events | Foundation | original |
| 3 | [F03](prompts/F03-home-navigation-design-system-and-course-map.md) | Home, navigation, design system, and course map | Foundation | original |
| 4 | [F03a](prompts/F03a-course-outline-in-the-catalog.md) | Course outline in the catalog | Foundation | **follow-up** |
| 5 | [F04](prompts/F04-three-tab-lesson-workspace-and-instructor-assets.md) | Three-tab lesson workspace and instructor assets | Foundation | original |
| 6 | [L01](prompts/L01-create-a-mastra-project.md) | Create a Mastra project | 01 Mastra Foundations | original |
| 7 | [L02](prompts/L02-explore-project-architecture.md) | Explore project architecture | 01 Mastra Foundations | original |
| 8 | [L03](prompts/L03-create-and-register-a-first-agent.md) | Create and register a first agent | 01 Mastra Foundations | original |
| 9 | [L04](prompts/L04-model-and-instructions.md) | Model and instructions | 01 Mastra Foundations | original |
| 10 | [L05](prompts/L05-inspect-agent-in-studio.md) | Inspect agent in Studio | 01 Mastra Foundations | original |
| 11 | [L06](prompts/L06-basic-text-generation.md) | Basic text generation | 02 Agent Generation and Streaming | original |
| 12 | [L06a](prompts/L06a-live-output-for-non-streaming-labs.md) | Live output for non-streaming labs | 02 Agent Generation and Streaming | **follow-up** |
| 13 | [L07](prompts/L07-behavior-and-instruction-variants.md) | Behavior and instruction variants | 02 Agent Generation and Streaming | original |
| 14 | [L07a](prompts/L07a-outgoing-secret-check.md) | Outgoing secret check | 02 Agent Generation and Streaming | **follow-up** |
| 15 | [L08](prompts/L08-token-streaming.md) | Token streaming | 02 Agent Generation and Streaming | original |
| 16 | [L09](prompts/L09-structured-json-generation.md) | Structured JSON generation | 02 Agent Generation and Streaming | original |
| 17 | [L10](prompts/L10-failures-retries-and-limits.md) | Failures, retries and limits | 02 Agent Generation and Streaming | original |
| 18 | [L11](prompts/L11-first-custom-tool.md) | First custom tool | 03 Tools and Function Calling | original |
| 19 | [L12](prompts/L12-tool-validation-with-zod.md) | Tool validation with Zod | 03 Tools and Function Calling | original |
| 20 | [L13](prompts/L13-multiple-tools.md) | Multiple tools | 03 Tools and Function Calling | original |
| 21 | [L14](prompts/L14-external-api-tool.md) | External API tool | 03 Tools and Function Calling | original |
| 22 | [L15](prompts/L15-safe-tool-execution.md) | Safe tool execution | 03 Tools and Function Calling | original |
| 23 | [L15a](prompts/L15a-interactive-human-approval-during-runs.md) | Interactive human approval during runs | 03 Tools and Function Calling | **follow-up** |
| 24 | [L15b](prompts/L15b-run-tokens-and-approval-capacity.md) | Run tokens and approval capacity | 03 Tools and Function Calling | **follow-up** |
| 25 | [L16](prompts/L16-dynamic-instructions.md) | Dynamic instructions | 04 Agent Configuration and Context | original |
| 26 | [L17](prompts/L17-request-context.md) | Request context | 04 Agent Configuration and Context | original |
| 27 | [L18](prompts/L18-context-aware-tools.md) | Context-aware tools | 04 Agent Configuration and Context | original |
| 28 | [L18a](prompts/L18a-release-gates.md) | Release gates | 04 Agent Configuration and Context | **follow-up** |
| 29 | [L19](prompts/L19-execution-options.md) | Execution options | 04 Agent Configuration and Context | original |
| 30 | [L20](prompts/L20-input-and-output-processing.md) | Input and output processing | 04 Agent Configuration and Context | original |
| 31 | [L21](prompts/L21-persistent-message-history.md) | Persistent message history | 05 Conversational Memory | original |
| 32 | [L22](prompts/L22-threads-and-user-boundaries.md) | Threads and user boundaries | 05 Conversational Memory | original |
| 33 | [L23](prompts/L23-working-memory.md) | Working memory | 05 Conversational Memory | original |
| 34 | [L24](prompts/L24-semantic-recall.md) | Semantic recall | 05 Conversational Memory | original |
| 35 | [L24a](prompts/L24a-vector-recall-under-concurrent-runs.md) | Vector recall under concurrent runs | 05 Conversational Memory | **follow-up** |
| 36 | [L25](prompts/L25-observational-memory.md) | Observational memory | 05 Conversational Memory | original |
| 37 | [L26](prompts/L26-first-typed-workflow.md) | First typed workflow | 06 Workflow Foundations | original |
| 38 | [L27](prompts/L27-sequential-steps.md) | Sequential steps | 06 Workflow Foundations | original |
| 39 | [L28](prompts/L28-parallel-branches.md) | Parallel branches | 06 Workflow Foundations | original |
| 40 | [L29](prompts/L29-conditional-branching.md) | Conditional branching | 06 Workflow Foundations | original |
| 41 | [L30](prompts/L30-foreach-processing.md) | Foreach processing | 06 Workflow Foundations | original |
| 42 | [L31](prompts/L31-nested-workflows.md) | Nested workflows | 07 Advanced Workflows | original |
| 43 | [L32](prompts/L32-suspend-and-resume.md) | Suspend and resume | 07 Advanced Workflows | original |
| 44 | [L33](prompts/L33-human-approval.md) | Human approval | 07 Advanced Workflows | original |
| 45 | [L34](prompts/L34-long-running-reliability.md) | Long-running reliability | 07 Advanced Workflows | original |
| 46 | [L35](prompts/L35-business-process-capstone.md) | Business process capstone | 07 Advanced Workflows | original |
| 47 | [L36](prompts/L36-document-ingestion.md) | Document ingestion | 08 RAG and Knowledge Systems | original |
| 48 | [L37](prompts/L37-chunking-strategies.md) | Chunking strategies | 08 RAG and Knowledge Systems | original |
| 49 | [L38](prompts/L38-embeddings-and-store.md) | Embeddings and store | 08 RAG and Knowledge Systems | original |
| 50 | [L38a](prompts/L38a-exact-vector-search-for-course-stores.md) | Exact vector search for course stores | 08 RAG and Knowledge Systems | **follow-up** |
| 51 | [L39](prompts/L39-vector-retrieval.md) | Vector retrieval | 08 RAG and Knowledge Systems | original |
| 52 | [L40](prompts/L40-rag-question-answering-agent.md) | RAG question-answering agent | 08 RAG and Knowledge Systems | original |
| 53 | [L41](prompts/L41-metadata-filters.md) | Metadata filters | 09 Advanced RAG | original |
| 54 | [L42](prompts/L42-hybrid-search.md) | Hybrid search | 09 Advanced RAG | original |
| 55 | [L43](prompts/L43-reranking.md) | Reranking | 09 Advanced RAG | original |
| 56 | [L44](prompts/L44-citation-aware-generation.md) | Citation-aware generation | 09 Advanced RAG | original |
| 57 | [L45](prompts/L45-rag-quality-evaluation.md) | RAG quality evaluation | 09 Advanced RAG | original |
| 58 | [L46](prompts/L46-connect-mcp-server.md) | Connect MCP server | 10 Model Context Protocol | original |
| 59 | [L47](prompts/L47-discover-mcp-tools.md) | Discover MCP tools | 10 Model Context Protocol | original |
| 60 | [L48](prompts/L48-mcp-resources-and-prompts.md) | MCP resources and prompts | 10 Model Context Protocol | original |
| 61 | [L49](prompts/L49-expose-mastra-over-mcp.md) | Expose Mastra over MCP | 10 Model Context Protocol | original |
| 62 | [L50](prompts/L50-multi-server-mcp-agent.md) | Multi-server MCP agent | 10 Model Context Protocol | original |
| 63 | [L51](prompts/L51-two-collaborating-agents.md) | Two collaborating agents | 11 Multi-Agent Architectures | original |
| 64 | [L52](prompts/L52-agent-handoffs.md) | Agent handoffs | 11 Multi-Agent Architectures | original |
| 65 | [L53](prompts/L53-supervisor-pattern.md) | Supervisor pattern | 11 Multi-Agent Architectures | original |
| 66 | [L54](prompts/L54-coordinated-agent-workflow.md) | Coordinated agent workflow | 11 Multi-Agent Architectures | original |
| 67 | [L55](prompts/L55-research-team-capstone.md) | Research team capstone | 11 Multi-Agent Architectures | original |
| 68 | [L56](prompts/L56-trace-events.md) | Trace events | 12 Evaluation and Observability | original |
| 69 | [L57](prompts/L57-custom-scorer.md) | Custom scorer | 12 Evaluation and Observability | original |
| 70 | [L58](prompts/L58-evaluation-dataset.md) | Evaluation dataset | 12 Evaluation and Observability | original |
| 71 | [L59](prompts/L59-compare-experiments.md) | Compare experiments | 12 Evaluation and Observability | original |
| 72 | [L60](prompts/L60-quality-dashboard.md) | Quality dashboard | 12 Evaluation and Observability | original |
| 73 | [L61](prompts/L61-authenticated-api.md) | Authenticated API | 13 Security and Reliability | original |
| 74 | [L62](prompts/L62-tenant-isolation.md) | Tenant isolation | 13 Security and Reliability | original |
| 75 | [L62a](prompts/L62a-tenant-isolation-for-migrated-stores-and-browser-storage.md) | Tenant isolation for migrated stores and browser storage | 13 Security and Reliability | **follow-up** |
| 76 | [L63](prompts/L63-untrusted-input-and-prompt-injection.md) | Untrusted input and prompt injection | 13 Security and Reliability | original |
| 77 | [L64](prompts/L64-tool-approval-policies.md) | Tool approval policies | 13 Security and Reliability | original |
| 78 | [L65](prompts/L65-timeouts-and-failure-testing.md) | Timeouts and failure testing | 13 Security and Reliability | original |
| 79 | [L66](prompts/L66-react-client-integration.md) | React client integration | 14 Full-Stack AI Applications | original |
| 80 | [L67](prompts/L67-streaming-chat-ui.md) | Streaming chat UI | 14 Full-Stack AI Applications | original |
| 81 | [L68](prompts/L68-workflow-visualizer.md) | Workflow visualizer | 14 Full-Stack AI Applications | original |
| 82 | [L69](prompts/L69-voice-assistant.md) | Voice assistant | 14 Full-Stack AI Applications | original |
| 83 | [L70](prompts/L70-interactive-agent-workspace.md) | Interactive agent workspace | 14 Full-Stack AI Applications | original |
| 84 | [L71](prompts/L71-durable-production-persistence.md) | Durable production persistence | 15 Production and Capstone | original |
| 85 | [L72](prompts/L72-configuration-and-packaging.md) | Configuration and packaging | 15 Production and Capstone | original |
| 86 | [L73](prompts/L73-deploy-application.md) | Deploy application | 15 Production and Capstone | original |
| 87 | [L74](prompts/L74-production-regression-suite.md) | Production regression suite | 15 Production and Capstone | original |
| 88 | [L75](prompts/L75-enterprise-ai-assistant-capstone.md) | Enterprise AI Assistant capstone | 15 Production and Capstone | original |
