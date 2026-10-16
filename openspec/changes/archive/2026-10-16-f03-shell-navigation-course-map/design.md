# Design

## Context

F01 web is a single page; F02 exposes `GET /api/labs/:id`. Course outline titles are known for labs 01–24 (modules 01–05); module titles 06–15 and lab titles 25–75 are pending from the course owner. Every module holds five labs (Module 01 = L01–L05 … Module 05 = L21–L25), which fixes lab→module mapping for all 75 labs.

## Goals / Non-Goals

**Goals:** catalog-driven, deep-linkable, keyboard- and screen-reader-friendly shell; truthful progress.

**Non-Goals:** Learn/Run/Source tabs, quiz, notes (F04); writing progress (F04 writes, F03 only reads).

## Decisions

- **react-router 8.4.0 data router** (`createBrowserRouter`, `RouterProvider` from `react-router/dom`); verified exports in the installed package. A root layout route renders the shell; `errorElement` renders 404. The `?lesson=` compatibility check runs in the root layout (works on any path) using `<Navigate replace>`.
- **Locked labs are real catalog entries** with `status: 'locked'` and `titleConfirmed`. Placeholder titles read "Lab NN — title pending" so nothing pretends to be final. When a lab is implemented, its entry flips to `available`. The conformance suite enforces registered ⇒ available; an API test enforces available ⇒ registered (the browser-safe catalog package cannot import the server registry itself).
- **Prerequisites**: lab N lists lab N−1 (lab-01 lists lab-00). Shown as advisory status chips; they never block navigation.
- **Tokens** as CSS custom properties consumed through Tailwind v4 `@theme inline` (`bg-surface`, `text-fg-muted`, …). Light default; `data-theme="dark"` on `<html>`, set before paint by an inline script to avoid flashes. Contrast ≥ 4.5:1 for text tokens.
- **Icons** as inline SVG components (no icon dependency).
- **Progress storage adapter** `ProgressStore` interface with `LocalStorageProgressStore` (key `mlp.progress.v1`, Zod-validated, corrupt data ignored) and `MemoryProgressStore` for tests, provided via React context. F04 adds writes.
- **Search** follows the WAI-ARIA combobox pattern (input `role=combobox`, `aria-expanded`, `aria-activedescendant`, listbox options).
- **Sidebar keyboard**: native buttons/links in DOM order (Tab), plus ArrowUp/ArrowDown/Home/End roving between sidebar items; module collapse state persisted (`mlp.sidebar.v1`).
- **Mobile**: below `lg` the sidebar becomes a modal drawer (`role=dialog`, `aria-modal`), focus trapped, Escape/backdrop closes, focus restored to the menu button.
- **Route focus**: after navigation, focus moves to the page `h1` (`tabIndex=-1`) and the document title updates.
- **Accessibility tests**: `@axe-core/playwright` on Home, lab, locked lab, 404 (fail on serious/critical).

## Risks / Trade-offs

- [Placeholder titles may confuse] → explicit "title pending" wording and `titleConfirmed=false` styling (italic + note).
- [Lab N−1 prerequisite chain is a simplification] → editable per lab when each lab change lands.

## Migration Plan

Catalog shape adds `titleConfirmed` (required boolean). All entries are in-repo; no external consumers.
