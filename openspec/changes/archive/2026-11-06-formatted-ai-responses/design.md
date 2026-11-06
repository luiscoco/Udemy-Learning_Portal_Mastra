## Context
CodeBlock uses prism-react-renderer. RunTab, chat, workspace, voice and agent conversation replies are plain text; JsonView also displays plain code. User messages and cited passages must remain literal.

## Goals / Non-Goals
Goals: readable safe Markdown, highlighted common course languages, accessible copyable code, consistent streaming and completed replies, responsive tables and long lines.
Non-goals: executing code, interpreting raw HTML, rendering external images, changing provider behavior or API contracts.

## Decisions
- Use exact react-markdown 10.1.0 and remark-gfm 4.0.1; skip raw HTML, reject unsafe URLs and render image descriptions without loading images. No raw HTML plugin.
- Extend the shared CodeBlock with PrismJS 1.30.0 official grammars, explicit aliases and plain-text fallback. Bound highlighting work for large code while preserving all text. Keep source copy/download controls and add copy to response code.
- Introduce a scoped FormattedResponse component used only for assistant prose. Keep raw JSON inspectable through highlighted JsonView and evidence literal. Include liveCheckpoint.answer in completed-answer selection.
- Use semantic code markup and scoped typography, scrollable tables/code, visible focus and explicit copy status. No external assets or fonts.

## Risks / Trade-offs
Streaming may show incomplete Markdown until more tokens arrive; CommonMark handles unterminated fences. Markdown rendering is bounded for very large replies, which fall back to readable literal text. Unsupported code languages remain plain text. Model-supplied HTML and external images are intentionally not interpreted.

## Migration Plan
No data or contract migration. Revert web components and dependencies to roll back.

## Open Questions
None.
