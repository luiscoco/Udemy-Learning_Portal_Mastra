# Design

## Context

See proposal.md. React/Vite/Tailwind v4 already uses semantic CSS variables, shared Cards/Sections and accessible tabs. There are substantial unrelated uncommitted startup/live changes. The reference's current portal.css overrides its older green stylesheet with a black/navy shell and pastel learning cards; that current treatment is the inspiration.

## Goals / Non-Goals

Improve hierarchy and readability using native CSS and existing components. Preserve URLs, all 76 entries, controls, progress/auth state and CSP. Do not copy OpenAI branding/portraits, add provider behavior, install dependencies, fetch fonts or introduce a parallel UI framework.

## Decisions

- Keep the existing light-first and persisted theme behavior. Both themes get a dark header/sidebar; the dark canvas becomes near-black, while light retains a pale canvas. Paper-like learning surfaces stay readable in either theme using scoped semantic tokens.
- Use blue for Learn, amber for Run, violet for Source and green for review, plus visible numeric stage markers. Retain the exact accessible tab labels and existing keyboard/state logic; decorative markers are aria-hidden.
- Add explicit presentation classes to layout/components rather than broad element overrides that would affect graphs, code or hidden tab panels. Scope all text/status/border tokens together inside bright panels to avoid light text on light surfaces.
- Use the existing Mastra M mark and locally available system font stack. Responsive spacing, 44px primary controls and reduced-motion/forced-color support improve usability without new assets or network requests.
- Add a rendered visual smoke suite covering Home and all three lesson tabs in light/dark desktop/mobile, capturing screenshots, axe findings and horizontal overflow. Reuse existing route, drawer, keyboard, theme, run and progress tests.

## Risks / Trade-offs

- Scoped tokens can affect nested graph/code controls: inspect screenshots and retain code-surface tokens, plus exercise existing workflow/voice/source tests.
- A reference-inspired hierarchy is not a pixel-identical clone; course structure and Mastra identity remain primary.
- More visible panels can create excessive vertical space on phones: use compact responsive padding and collapse existing grids in normal DOM order.

## Migration Plan

No data or API migration. Reload the running Vite app. Saved theme/progress remain valid. Revert presentation changes to roll back.
