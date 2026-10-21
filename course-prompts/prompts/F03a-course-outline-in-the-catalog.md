# F03a — Course outline in the catalog

**Module:** Foundation · **Step 4 of 88** · **OpenSpec change:** `catalog-course-outline`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [F03](F03-home-navigation-design-system-and-course-map.md) · Next: [F04](F04-three-tab-lesson-workspace-and-instructor-assets.md)

## Copy-ready prompt

Implement platform follow-up F03a — "Course outline in the catalog" for the Mastra Udemy learning platform.

Why: F03 builds the course map with placeholder titles. You already have the complete outline in this prompt pack, so learners should see every real lab and module title from the start, while unimplemented labs stay locked.

Requirements: In packages/lab-catalog, set the confirmed title of every lab and module below. Keep ids (lab-01 … lab-75), routes (/labs/lab-XX and ?lesson=lab-XX), ordering and availability unchanged: only implemented labs are available, all others stay locked with a "coming soon" state. Add a catalog test asserting 75 unique labs, 15 modules, and that every title is non-empty.

Modules:
- 01 Mastra Foundations
- 02 Agent Generation and Streaming
- 03 Tools and Function Calling
- 04 Agent Configuration and Context
- 05 Conversational Memory
- 06 Workflow Foundations
- 07 Advanced Workflows
- 08 RAG and Knowledge Systems
- 09 Advanced RAG
- 10 Model Context Protocol
- 11 Multi-Agent Architectures
- 12 Evaluation and Observability
- 13 Security and Reliability
- 14 Full-Stack AI Applications
- 15 Production and Capstone

Labs:
- L01 Create a Mastra project
- L02 Explore project architecture
- L03 Create and register a first agent
- L04 Model and instructions
- L05 Inspect agent in Studio
- L06 Basic text generation
- L07 Behavior and instruction variants
- L08 Token streaming
- L09 Structured JSON generation
- L10 Failures, retries and limits
- L11 First custom tool
- L12 Tool validation with Zod
- L13 Multiple tools
- L14 External API tool
- L15 Safe tool execution
- L16 Dynamic instructions
- L17 Request context
- L18 Context-aware tools
- L19 Execution options
- L20 Input and output processing
- L21 Persistent message history
- L22 Threads and user boundaries
- L23 Working memory
- L24 Semantic recall
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
- L54 Coordinated agent workflow
- L55 Research team capstone
- L56 Trace events
- L57 Custom scorer
- L58 Evaluation dataset
- L59 Compare experiments
- L60 Quality dashboard
- L61 Authenticated API
- L62 Tenant isolation
- L63 Untrusted input and prompt injection
- L64 Tool approval policies
- L65 Timeouts and failure testing
- L66 React client integration
- L67 Streaming chat UI
- L68 Workflow visualizer
- L69 Voice assistant
- L70 Interactive agent workspace
- L71 Durable production persistence
- L72 Configuration and packaging
- L73 Deploy application
- L74 Production regression suite
- L75 Enterprise AI Assistant capstone

Definition of done: Navigation, course map and locked lesson pages show the real titles; no lab becomes runnable; catalog tests pass.

First create an OpenSpec change named catalog-course-outline with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
