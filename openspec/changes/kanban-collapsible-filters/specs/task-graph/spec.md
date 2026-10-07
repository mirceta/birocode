## ADDED Requirements

### Requirement: The filter bar folds to a one-line summary
The task filter bar (Kanban and Task graph) SHALL be headed by a focusable toggle —
chevron, "Filters", and a badge with the number of active filter values — operable by
click, Enter and Space, exposing `aria-expanded`. Collapsed, the bar SHALL show one line:
the toggle, one summary chip per active filter value (its kind and its label, e.g.
"machine: spacex", "state: In progress", "text: prg"), each with its own × that clears
only that value without expanding, a "clear all" when anything is active, the
"N of M tasks" count, and the view's extra control; with no filter active it SHALL say
"no filters". Expanded, the bar SHALL show the controls unchanged. The fold SHALL default
to collapsed, be remembered per browser, and be shared by every mounted bar. Folding
SHALL NOT change the filter: URL persistence, the remembered filter and the chip counts
keep working. Collapsed, the block below the bar SHALL start directly under the one line.

#### Scenario: First visit
- **WHEN** the Operator opens the Kanban with no fold remembered and no filter set
- **THEN** the bar is one line reading "Filters · no filters · M tasks" and the columns start right under it

#### Scenario: Three filters, folded
- **WHEN** machine spacex, state In progress and text "prg" are active and the bar is collapsed
- **THEN** the line shows the badge 3 and the chips "machine: spacex", "state: In progress", "text: prg", each with ×, "× clear all" and "N of M tasks"

#### Scenario: Clear one from the line
- **WHEN** the Operator presses the × on "state: In progress"
- **THEN** only the state filter is cleared, the bar stays collapsed, the other chips stay and the URL drops `state=doing`

#### Scenario: Remembered
- **WHEN** the Operator expands the bar and reloads the page
- **THEN** the bar opens expanded; folding it and reloading opens it collapsed

#### Scenario: Shared with the graph
- **WHEN** the Kanban's bar is collapsed with a state filter and the Operator switches to the Task graph
- **THEN** the graph's bar is collapsed too, shows the same chip and still offers its hide-filtered toggle
