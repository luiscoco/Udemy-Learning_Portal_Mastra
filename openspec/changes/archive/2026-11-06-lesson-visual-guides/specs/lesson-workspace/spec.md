## ADDED Requirements

### Requirement: Supplementary visual study tabs
Every available lesson SHALL additionally render Infographic Content and Exercise Walkthrough tabs with deep links `?tab=infographic` and `?tab=walkthrough`. Existing Learn, Run and Source links, default selection and mounted exercise state SHALL be preserved. All tabs SHALL support keyboard navigation and fit narrow screens.

#### Scenario: Open a visual tab directly
- **WHEN** a learner opens either visual-tab deep link or its legacy lesson-query equivalent
- **THEN** the requested tab is selected and the correct lesson's content is displayed

#### Scenario: Return to an ongoing exercise
- **WHEN** a learner switches to visual guidance and back to Run
- **THEN** existing input, partial execution and cancellation controls remain available without a new run starting

### Requirement: Mastra-specific readable infographics
Each lesson SHALL provide distinct Mastra concept and exercise diagrams with full text summaries. Artwork SHALL follow the supplied white/pastel style and this portal's numbering and compatibility. Viewers SHALL support fit, zoom, pointer/keyboard pan or scroll, fullscreen with focus restoration, and image/text downloads. Diagrams SHALL be labelled as teaching content, require no provider calls or external assets, and never imply execution.

#### Scenario: Inspect and export a diagram
- **WHEN** a learner zooms, opens fullscreen or downloads an infographic
- **THEN** the correct lesson diagram remains readable, scrolls within its viewport and exports with its labels intact

#### Scenario: Export unavailable
- **WHEN** an image export fails
- **THEN** an accessible error appears and the SVG/text alternatives remain usable

### Requirement: Checked explanatory code excerpts
Visual guides SHALL include short syntax-coloured explanatory excerpts where applicable, copied from declared non-solution lesson reference files. They SHALL identify source provenance and omitted setup, provide readable code alongside the image, and preserve solution reveal boundaries.

#### Scenario: Read a teaching code excerpt
- **WHEN** an infographic includes code
- **THEN** syntax colours, source provenance and omitted-setup context are provided, and hidden exercise solutions remain hidden

### Requirement: Guided exercise phases
Exercise Walkthrough SHALL provide goal, preparation, baseline, evidence review, changed scenario and explanation phases using the lesson's actual example input, checks and challenge. It SHALL link to teaching/execution/source/notes sections without running code, changing current inputs, revealing hidden solutions or marking learner progress. Phase position SHALL survive tab changes within the current lesson and account.

#### Scenario: Walk through a lesson
- **WHEN** a learner selects phases or follows a guidance link
- **THEN** relevant lesson instructions and expected evidence appear without an execution, grade or progress change
