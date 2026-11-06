## Why
AI replies currently expose Markdown punctuation and fenced code as plain text. The Source tab already highlights code, but response and JSON panels do not consistently do so.

## What Changes
- Render assistant Markdown safely, including headings, lists, tables, inline code and highlighted fenced code.
- Share code presentation across source, AI replies and JSON output, with language labels and copy controls for reply code.
- Preserve literal user messages and cited evidence, streaming and existing execution contracts.
- Verify rendering, security, accessibility and responsive layout offline.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `lesson-workspace`: safe formatted assistant replies and consistent syntax-highlighted code.

## Impact
Web-only rendering, exact web dependencies and tests. No server contracts, provider calls or credentials change.
