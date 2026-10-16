# Tasks

## 1. Catalog

- [x] 1.1 Add `titleConfirmed` to catalog labs; register lab-01..lab-75 as locked (titles for 01–24, pending for 25–75) in modules of five — verify catalog tests (layout, uniqueness, only lab-00 available)
- [x] 1.2 API test: catalog `available` labs equal registry ids

## 2. Design system

- [x] 2.1 Tokens (light + dark), Tailwind theme mapping, base styles, focus ring, reduced motion — verify build
- [x] 2.2 Components: Button, Badge, Card, Skeleton, ProgressBar, icons, StatusChip — verify component tests

## 3. Shell and routing

- [x] 3.1 Progress store adapter (localStorage + memory) + context — verify unit tests incl. corrupt data
- [x] 3.2 Router with root layout, Home, Lab page, 404, `?lesson=` redirect — verify routing tests
- [x] 3.3 Sidebar (collapsible modules, locked badges, aria-current, roving keys, persisted state) — verify tests
- [x] 3.4 Header: search combobox, theme toggle, mobile menu drawer with focus trap — verify tests
- [x] 3.5 Home page: hero, truthful progress summary, course map of modules — verify tests
- [x] 3.6 Lab page: skeleton, error+retry, available summary, locked preview, prerequisites — verify tests

## 4. End-to-end

- [x] 4.1 Playwright desktop + mobile: navigation, deep links, legacy query, 404, search keyboard flow, theme persistence, mobile menu Escape, axe scans — verify `npm run test:e2e`
- [x] 4.2 `npm run verify` green; README updated

## Workflow follow-up

- Archive with `npx openspec archive f03-shell-navigation-course-map -y` and commit.
