## ADDED Requirements

### Requirement: Documented MCP capability probe
Lab 48 SHALL probe the local MCP server's advertised capabilities with the MCP SDK client and present a matrix that distinguishes what the protocol defines, what the server advertises, what the Mastra adapter exposes and what was observed.

#### Scenario: Full server
- **WHEN** the example runs against the `full` server
- **THEN** the matrix shows resources, templates, subscriptions and prompts as advertised and supported, completions as not advertised and not exposed by Mastra, and the syllabus resource is read from the server

#### Scenario: Tools-only server
- **WHEN** the server is `tools-only`
- **THEN** resources and prompts are shown as not advertised, the matrix notes that Mastra's list calls return an empty list for a missing capability, and no resource or prompt request is sent

### Requirement: Graceful fallback
When a feature is missing or limited, the lab SHALL offer a labelled fallback instead of failing.

#### Scenario: Resource fallback
- **WHEN** a resource is requested from the `tools-only` server, or a template URI such as `course://labs/47` is requested from the `full` server
- **THEN** the content comes from a fallback tool, labelled as a fallback with its reason

#### Scenario: Prompt fallback
- **WHEN** `explain-lab` is requested from the `tools-only` server
- **THEN** a local template is rendered and labelled "local fallback, not from the server"

#### Scenario: Errors that have no fallback
- **WHEN** a prompt is requested without its required argument
- **THEN** the lab reports a classified `missing-argument` error
