# Learning portal visual style

The Mastra portal takes visual direction from the owner's [OpenAI learning portal](https://github.com/luiscoco/Udemy-OpenAI-API-Build-a-Learning-Portal), particularly its current `src/portal.css` and numbered stages in `src/LessonLayout.tsx`: a dark course frame, readable pale learning surfaces, warm exercise accents and green review areas. Mastra keeps its own mark, course registry and Learn/Run/Source structure.

`apps/web/src/portal.css` contains the presentation layer. `index.css` retains the Tailwind theme mappings, base focus behavior and reduced-motion rules; `main.tsx` loads the presentation layer afterward. The system font stacks are defined explicitly, with no external font service or new dependency. Both saved themes retain their behavior: light has a pale canvas, dark a near-black canvas, and both have a dark header/sidebar with paper-like reading surfaces.

- Blue identifies Learn, amber Run, violet Source and green the quiz/reflection area. Numbers, text labels, selected-state backgrounds and ARIA state make the stages understandable without color.
- `.portal-header` and `.course-sidebar` scope navigation tokens. `.paper-surface`, tab panels and `.lesson-review` scope foreground, borders, statuses, forms and code tokens together so a dark preference cannot create pale text on a pale card.
- The home hero and course-module cards provide hierarchy; counts, start/continue actions and progress are derived from the existing catalog/state.
- Shared Sections provide content cards; primary buttons use a 44px minimum height. Existing keyboard tabs, mounted hidden panels, mobile focus trap, saved theme and source/run behavior remain in their original components.

To review locally, run `npm run dev` and wait for the API-ready/Vite URL. Inspect Home and a lesson's three tabs, switch themes, then open the mobile course menu. Existing live/offline configuration is unchanged by this visual work.

`npx playwright test e2e/portal-style.spec.ts` checks Home, Learn, Run, Source and a completed offline workflow in both themes on desktop/mobile. It checks WCAG A/AA findings with axe, body font fallback and page-level horizontal overflow, and captures screenshots under `.data/portal-style/`. A separate 320px menu check covers the narrower layout. The screenshots use isolated test learners and an offline test server; they do not depict the instructor's live configuration or make paid model calls. Review screenshots as well as tests: automated scans cannot establish every aspect of accessibility or design quality.
