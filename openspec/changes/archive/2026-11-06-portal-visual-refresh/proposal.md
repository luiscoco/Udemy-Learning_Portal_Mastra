# Proposal

## Why

The owner wants the Mastra portal to resemble their OpenAI learning portal. Its inspected portal.css uses a dark course frame, pale blue learning panels, amber exercise accents, green review panels and numbered stages. The current portal has a largely uniform indigo/slate treatment with weak separation between reading, running and reviewing.

## What Changes

- Refresh the shell, sidebar, home hero and course cards with the reference's visual hierarchy, retaining Mastra branding.
- Give Learn, Run, Source and review areas distinct numbered/color treatments, clearer borders and readable spacing.
- Preserve saved themes, accessible navigation, stable routes, lesson state and all live/offline functionality.
- Verify desktop/mobile appearance, contrast and overflow with rendered screenshots and existing behavior tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-shell`: cohesive course-frame and learning-stage visual hierarchy with readable, responsive surfaces.

## Impact

Frontend tokens, layout, shared visual primitives and lesson/home presentation only. No server, lab, credential, package-version or storage-contract changes. Existing uncommitted startup/live changes are retained. Reference: https://github.com/luiscoco/Udemy-OpenAI-API-Build-a-Learning-Portal (src/portal.css, styles.css, App.tsx and LessonLayout.tsx inspected).
