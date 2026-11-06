# Formatted assistant replies and code

Assistant replies now render Markdown headings, emphasis, lists, quotes, tables, inline code and fenced code as readable content. This applies to standard live output (streamed or returned at completion), practical live checkpoints, chat history and streaming, agent workspace replies, voice answers, verified claims and multi-agent replies/outcomes.

`apps/web/src/components/workspace/FormattedResponse.tsx` owns safe Markdown presentation. `CodeBlock.tsx`, `code-languages.ts` and `formatted-response.css` provide consistent coloured code, line numbers and language labels. Response code offers **Copy code**, copying its original content without line numbers, and reports clipboard failure accessibly. Source file copy/download controls remain available. JSON output, expected results, traces, schemas and MCP tool arguments/results use the shared highlighter.

Supported grammars: TypeScript, JavaScript, TSX, JSX, JSON, Bash/shell, Python, SQL, YAML, Markdown, HTML/XML and CSS. Unknown languages (including Mermaid diagrams) remain literal plain text. Syntax colouring stops above 40,000 characters or 1,000 lines; the full block is retained. Responses over 100,000 characters show a labelled plain-text fallback. Incomplete streaming Markdown is rendered as it arrives and updated as the reply grows.

Raw HTML is disabled. Unsafe URL schemes and protocol-relative links are rejected. Model-supplied images show their alternative description and do not trigger image requests. Student messages, document previews, citation passages and planted multi-agent evidence stay literal; no submitted code is executed. Source files remain source code even when their language is Markdown.

## Demo

1. Start `npm run dev`, sign in and open a lesson's Run tab.
2. Ask an agent to explain an example with a heading, numbered steps and a fenced TypeScript code block. Live runs use your configured provider and can incur charges; offline runs remain free and deterministic.
3. Check that prose is formatted, code is coloured and **Copy code** copies clean code. Inspect the Source tab and structured JSON output for consistent highlighting.
4. Switch themes or use a narrow screen: long code and wide tables scroll inside the reply.

The deterministic Playwright scenarios in `e2e/formatted-response.spec.ts` supply a fixture through the typed SSE client to prove both streamed and completed checkpoint output without paid calls. Screenshots are under `.data/formatted-response/`.

## Validation

`npm run verify` passed: lint, all workspace TypeScript checks, 90 strict specifications, 1,718 tests passed / 82 optional tests skipped, production API/web builds and bundle secrets scan. Evidence: `.data/formatted-verify.log` and `.data/formatted-verify.exit` (0).

Focused renderer, safety, copy, streaming, checkpoint and existing workspace tests passed (32 initially); the full suite also includes new chat, voice and agent-conversation formatting/literal-input regression cases. `npm run test:e2e -- e2e/formatted-response.spec.ts` passed all 5 tests including setup: desktop/mobile streamed and completed checkpoint scenarios in both themes, zero axe WCAG A/AA violations, no external response-image request, no page overflow at 320px.

`npm run test:e2e` passed in one complete run: **267 passed, 158 optional/viewport-specific skips, zero failures** (12 minutes). It exercised every lesson example on desktop and mobile, the new formatted replies, existing Source controls, chat, voice, multi-agent/citation views, recovery, progress and portal visual/accessibility checks. Evidence: `.data/formatted-e2e.log` and `.data/formatted-e2e.exit` (0).

`npx openspec validate formatted-ai-responses --strict` passed before implementation. Both new lesson-workspace requirements were synced verbatim, preserving existing requirements and Purpose; `npx openspec validate --specs --strict --no-interactive` passed all 90 specs after sync. Archive: `openspec/changes/archive/2026-11-06-formatted-ai-responses/`. Changes are local and uncommitted.

Costs for this change: no paid provider calls. Existing API, lab routes and storage contracts are unchanged. Build tooling reports the existing large chunk and Tailwind sourcemap warnings.
