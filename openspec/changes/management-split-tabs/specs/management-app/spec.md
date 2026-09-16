## ADDED Requirements

### Requirement: Ideas, Task graph and Kanban are separate Management tabs
The Management App SHALL offer Ideas, Task graph and Kanban as three separate tabs and
side-by-side panes. The Ideas tab SHALL hold the ideas list and the architectural plan
only, with no inner graph or kanban tab, while "Break into tasks" still works from its
composer and reports its progress inline. The Task graph tab and the Kanban tab SHALL
render that board alone, and the standalone graph SHALL refresh on an interval so tasks
created in another pane or by an agent appear without a reload. The studio Ideas tab
SHALL keep the combined view.

#### Scenario: Graph beside the ideas list
- **WHEN** the operator shows the Ideas and Task graph panes side by side
- **THEN** the ideas list with its composer is in one pane and the graph alone in the other, and a task created from the composer appears in the graph pane within one refresh interval

#### Scenario: Deep link to a board
- **WHEN** the app is opened with `?tab=kanban`
- **THEN** the Kanban board renders alone as the active tab

### Requirement: Side-by-side panes are reorderable
In the side-by-side layout each pane bar SHALL offer move-left and move-right controls
that move the pane one step among the visible panes, skipping hidden panes, which keep
their slot; the first visible pane's move-left and the last visible pane's move-right
SHALL be disabled. The order SHALL persist per device, the tab strip SHALL follow it,
and a tab the saved order does not know SHALL join at its default position.

#### Scenario: Move right
- **WHEN** the operator presses move-right on the second of seven panes
- **THEN** it swaps places with the third, the tab strip shows the same order, and a reload keeps it

#### Scenario: Hidden pane is skipped
- **WHEN** a pane between two visible panes is hidden and the operator moves the left one right
- **THEN** it lands after the next visible pane, and the hidden pane returns to its own slot when shown again
