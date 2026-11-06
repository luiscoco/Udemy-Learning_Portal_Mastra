# Spec Delta

## ADDED Requirements

### Requirement: Distinct learning surfaces
The portal SHALL present a cohesive dark navigation frame with visually distinct learning, exercise, source and review surfaces, retaining Mastra branding and the learner's saved theme. Stage labels and selection MUST remain understandable without color. Text MUST meet WCAG AA contrast, controls retain visible focus, and layouts MUST fit phone and desktop widths without page-level horizontal overflow.

#### Scenario: Lesson stages
- **WHEN** a learner opens Learn, Run or Source
- **THEN** the selected stage is visually clear, its content uses readable surfaces, and switching tabs preserves running work and existing keyboard behavior

#### Scenario: Mobile navigation and theme
- **WHEN** a learner opens the course menu on a narrow screen or changes theme
- **THEN** the navigation and learning surfaces remain readable, the menu keeps its focus/close behavior and the selected theme persists

#### Scenario: Home hierarchy
- **WHEN** Home is opened
- **THEN** the portal shows a prominent Mastra course introduction, a real start/continue action, truthful progress and grouped course modules with clear visual hierarchy
