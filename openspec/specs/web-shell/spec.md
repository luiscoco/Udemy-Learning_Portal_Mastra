# web-shell Specification

## Purpose
Navigation, routing, search, theming, progress display and accessibility of the learner web UI.

## Requirements

### Requirement: Catalog-driven navigation
The sidebar SHALL be generated from the catalog, showing Home, the orientation module and 15 collapsible course modules; available labs are links, locked labs are marked locked and open a preview page.

#### Scenario: Collapse a module
- **WHEN** a learner activates a module header
- **THEN** its lab list toggles and the header's `aria-expanded` reflects the state

#### Scenario: Active lab visible
- **WHEN** a lab page is open
- **THEN** its module is expanded and its link has `aria-current="page"`

### Requirement: Deep-linkable lesson routes
Lessons SHALL be reachable at `/labs/lab-XX`; the legacy `?lesson=lab-XX` query SHALL redirect to the same route; unknown routes or lab ids SHALL show a 404 page with a way home.

#### Scenario: Legacy query
- **WHEN** a learner opens `/?lesson=lab-00`
- **THEN** the URL becomes `/labs/lab-00` and the Dummy Lab 00 page is shown

#### Scenario: Unknown lab
- **WHEN** a learner opens `/labs/lab-98`
- **THEN** a "not found" page is shown with a link to Home

#### Scenario: Locked lab preview
- **WHEN** a learner opens a locked lab
- **THEN** the page shows its title, module and prerequisites with a clear "not yet available" notice and no run controls

### Requirement: Truthful progress
Course progress SHALL be derived only from stored progress records of available labs; with no records the UI SHALL show zero completion and SHALL NOT display completion for locked labs.

#### Scenario: Fresh learner
- **WHEN** no progress is stored
- **THEN** the progress summary shows 0 completed and the available/total lab counts

### Requirement: Search
A lab search SHALL filter labs by id, number, title or module title and support keyboard selection (arrow keys, Enter, Escape), with `/` focusing the search field.

#### Scenario: Keyboard search
- **WHEN** a learner presses `/`, types "dummy" and presses Enter
- **THEN** the Dummy Lab 00 page opens

### Requirement: Accessible, responsive shell
The shell SHALL provide a skip link, visible focus, landmark regions, a theme toggle persisted across reloads, focus moved to the page heading on navigation, and on narrow screens a menu button opening the sidebar as a dialog that closes with Escape and returns focus.

#### Scenario: Mobile menu
- **WHEN** a learner on a phone-width screen opens the menu and presses Escape
- **THEN** the menu closes and focus returns to the menu button

#### Scenario: Automated accessibility scan
- **WHEN** the Home, lab and 404 pages are scanned with axe
- **THEN** there are no serious or critical violations

### Requirement: Loading skeletons
While lesson data loads, the page SHALL show a skeleton marked `aria-busy`, and SHALL show an error state with retry if loading fails.

#### Scenario: API failure
- **WHEN** loading a lab definition fails
- **THEN** an alert explains the failure and offers Retry
