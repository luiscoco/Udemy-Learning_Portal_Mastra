# course-labs/lab-50-multi-server-mcp-agent Specification

## Purpose
Define the Multi-server MCP agent lab: one MCPClient over a local calculator server and a local course data server, tool exposure under a namespace, first-wins or reject collision policy, routing verified by server-side counters, and an agent that keeps working when one server is offline.

## Requirements

### Requirement: Multi-server MCP agent with namespaces
Lab 50 SHALL connect one Mastra MCPClient to a local calculator server and a local data server, expose their tools to an agent under a selected collision policy, and route each call to the owning server.

#### Scenario: Namespaced routing
- **WHEN** the example runs offline with the `namespace` policy and the question "What is 18% of 240, and what is the title of lab 47?"
- **THEN** `calc_percent_of` runs on the calculator server and `data_lab_title` on the data server, as the server-side counters confirm, and the answer contains 43.2 and "Discover MCP tools"

#### Scenario: Collision policies
- **WHEN** the policy is `first-wins` or `reject`
- **THEN** the shared tool name `info` is resolved (the data server's copy is shadowed, or both are excluded) and reported

### Requirement: Isolated server failure
One offline server SHALL NOT crash the lab.

#### Scenario: Calculator offline
- **WHEN** the calculator server is down
- **THEN** it is reported as unreachable, the data tool still runs, and the answer says the calculation is unavailable
