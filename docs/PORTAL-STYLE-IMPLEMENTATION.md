# Portal visual refresh

Date: 2026-11-06 (Europe/Madrid). Change: `portal-visual-refresh`.

The visual direction comes from the owner's [OpenAI learning portal](https://github.com/luiscoco/Udemy-OpenAI-API-Build-a-Learning-Portal): its current portal stylesheet, dark course frame, pale learning panels and numbered stages were inspected through GitHub. Mastra keeps its own branding, registry and Learn/Run/Source navigation. No reference application code was executed or instructor portrait copied.

## Delivered style

- Dark header/sidebar, stronger active lesson cards and numbered lesson markers.
- Wider desktop layout, a clearer Mastra course hero and blue/green/amber module cards.
- Numbered Learn/Run/Source tabs with blue, amber and violet treatments; green quiz/reflection surfaces.
- Scoped light-panel foreground/status/form tokens in both saved themes, consistent sans-serif body/monospace source fonts, and larger shared primary controls.
- Visible focus, reduced-motion/forced-color treatments, mobile drawer behavior and existing route/progress/run contracts retained. The branding link derives its accessible name from its visible text; the Home hero heading now has the ID referenced by its section label.

`apps/web/src/portal.css` is the presentation layer, imported by `main.tsx`. Other changed frontend paths are `components/layout/{AppShell,Sidebar,MobileDrawer}.tsx`, `components/workspace/{Tabs,Section,LabWorkspace}.tsx`, `components/ui/primitives.tsx`, `components/PageHeading.tsx` and `pages/{HomePage,LabPage}.tsx`. The visual fixture is `e2e/portal-style.spec.ts`; `playwright.config.ts` adds isolated visual-review learners. See [VISUAL-STYLE.md](VISUAL-STYLE.md) for maintenance boundaries and the reference.

## Verification

- `npx vitest run --project web`: **119 passed**, 27 files, 53.23 seconds.
- `npm run verify`: exit **0**, **1,706 passed, 82 skipped**; 155 files passed and 2 skipped, 145.37 seconds. Environment/spec checks, lint, strict types, build and frontend secret scan passed. Two configured secret values and seven secret key names were absent from the frontend bundle. Evidence: `.data/portal-verify.log` / `.data/portal-verify-exit.txt`.
- Rendered review covers Home, Learn, Run, Source and a completed offline workflow in light/dark desktop/mobile: **20 view/theme/layout combinations**, plus a **320px drawer** check. It checks font fallback, page overflow and axe WCAG 2 A/AA and 2.1 A/AA findings, including the Home secondary-action hover state. Screenshots include both lesson headers and actual tab content.
- The first full browser run found six accessibility failures caused by the same branding label mismatch. The label was corrected, and the new visual test's tag coverage expanded to include `wcag21a`. `npx playwright test e2e/portal-style.spec.ts e2e/shell.spec.ts --grep "course surfaces|no serious accessibility"` then passed **11 tests**, 1.4 minutes, with no findings in the selected scans. Evidence: `.data/portal-a11y-final.log` / `.data/portal-a11y-final-exit.txt`.
- Final lint and `npx vitest run apps/web/src/shell.test.tsx apps/web/src/auth.test.tsx`: **19 passed** after the accessible-branding correction.
- Final `npm run test:e2e`: **261 passed, 158 skipped**, with two desktop timeouts in scaffold/MCP cases (15.7 minutes). The accessibility failures did not recur. `npm run test:e2e -- --last-failed` passed **3 tests** including setup; the two cases passed unchanged in **11.2 and 6.8 seconds** (34.9 seconds total). All **263 distinct browser cases** have passed across that run and retry; a single clean unfiltered run is not claimed. No timeout or assertion was weakened. Evidence: `.data/portal-e2e-final.log`, `.data/portal-e2e-last-failed.log` and their exit files.
- Main specification sync: **90 specs passed** strict validation. Existing web-shell requirements and purpose were retained.

## Visual evidence and demo

Screenshots are under `.data/portal-style/` (25 files). Representative views:

- [Dark lesson](../.data/portal-style/desktop-dark-learn.png)
- [Exercise surface](../.data/portal-style/desktop-dark-run.png)
- [Source surface](../.data/portal-style/desktop-light-source.png)
- [Home and module cards](../.data/portal-style/desktop-dark-home.png)
- [320px course menu](../.data/portal-style/mobile-320-menu.png)

Run `npm run dev`, wait for API readiness, then refresh the portal. Inspect Home and a lesson's Learn/Run/Source tabs, toggle themes and open the mobile menu. The screenshots show isolated test learners and an intentionally offline test server; the instructor's live `.env` configuration was not changed by the style work.

## Costs and limits

No paid provider calls, deployment, new dependencies or external font requests were made for this change. Provider cost: **$0**. Existing startup/live implementation changes in the working tree were retained. Changes remain local and uncommitted.

The two local browser-run timeouts did not reproduce on unchanged retry; their underlying cause was not established. Existing non-failing bundle-size and Tailwind sourcemap warnings remain. Automated Chromium desktop/mobile checks and screenshot inspection do not substitute for physical-device, screen-reader or cross-browser usability review. No remote CI, public publication or pixel-identical reproduction is claimed.
