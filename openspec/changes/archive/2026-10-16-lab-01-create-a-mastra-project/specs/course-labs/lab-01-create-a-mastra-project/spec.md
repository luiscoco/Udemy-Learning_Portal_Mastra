## ADDED Requirements

### Requirement: Scaffold a buildable Mastra project
Lab 01 SHALL render a minimal Mastra TypeScript project from the learner's inputs (project name, provider, agent name, module type) and typecheck it with the TypeScript compiler against the installed `@mastra/core`, reporting compiler diagnostics without crashing.

#### Scenario: Example input builds
- **WHEN** the lab runs with the example input
- **THEN** the build step succeeds with zero diagnostics and every automated check passes

#### Scenario: CommonJS mistake
- **WHEN** the learner selects module type `commonjs`
- **THEN** the run completes, the "ESM configured" check fails and its message explains why Mastra projects use `"type": "module"`

### Requirement: Bootstrap transparency
The lab SHALL stream workflow steps (environment, configuration, render, build, cleanup), one log per generated file, and return the file tree with each root file's role, the parsed `package.json` and `tsconfig.json`, and the `.env.example` key names.

#### Scenario: Root files identified
- **WHEN** a run succeeds
- **THEN** the result lists `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` and `src/mastra/index.ts` with a role description for each

### Requirement: Safe server-side generation
Inputs SHALL be validated (slug project name, allowlisted provider, letters-only agent name); generated files SHALL be written only inside a per-run folder under the server data directory and deleted after the run, including on cancellation; no generated code is executed.

#### Scenario: Path traversal rejected
- **WHEN** the project name is `../evil`
- **THEN** the request fails with `VALIDATION_FAILED` before any file is written

#### Scenario: Cancel during build
- **WHEN** the learner cancels while the build step runs
- **THEN** the compiler worker is terminated, the folder is removed and the run ends `cancelled`
