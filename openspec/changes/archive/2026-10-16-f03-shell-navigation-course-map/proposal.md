# Proposal

## Why

Learners need to see the whole course, find a lab, and know what is actually available, without fake progress. F01's single page cannot navigate, deep-link or scale to 75 labs.

## What Changes

- Design tokens (light-first, spacious) with a dark theme, and a small accessible component set (button, badge, card, skeleton, progress bar, icons).
- App shell: skip link, header with Home link, lab search combobox and theme toggle, catalog-driven sidebar with the orientation module plus 15 collapsible course modules, mobile drawer menu, course progress summary.
- Routes: `/` (Home + course map), `/labs/:labId` (lesson page), `?lesson=lab-XX` compatibility redirect, graceful 404, loading skeletons.
- Catalog: labs 01–75 registered as **locked** previews (titles known for 01–24 from the course outline; 25–75 marked "title pending"); only lab-00 available. Prerequisites shown with real status.
- Progress read through a storage adapter (localStorage + memory); with no records, progress is 0.
- Playwright desktop + mobile tests including keyboard navigation and axe accessibility scans.

## Capabilities

### New Capabilities

- `web-shell`: navigation, routing, search, theming, progress display and accessibility behavior of the learner UI.

### Modified Capabilities

- `lab-catalog`: catalog now lists all 75 course labs as locked previews alongside available labs.

## Impact

`apps/web` restructured (router, layout, pages). `packages/lab-catalog` gains 75 locked entries; `packages/contracts` catalog lab gains `titleConfirmed`. New deps: react-router 8.4.0, @axe-core/playwright (dev).
