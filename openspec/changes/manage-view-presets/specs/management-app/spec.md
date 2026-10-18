## ADDED Requirements

### Requirement: The current dashboard view can be saved as a named preset
The Management dashboard SHALL offer "Save view" (button and Alt+Shift+S) that stores the view on screen: the visible panes in order, and the divider positions as fractions of the width. The result SHALL be a preset tab, visually distinct from feature tabs, named after the open panes joined with " | ". It SHALL be renamable, updatable from the current view, reorderable and deletable. Saving SHALL NOT change the view itself.

#### Scenario: Saving a three-pane view
- **WHEN** the Operator has Status, Kanban and Subagents side by side and presses Save view
- **THEN** a preset tab "Status | Kanban | Subagents" appears and the panes stay exactly as they were

### Requirement: Applying a preset restores its panes, order and dividers
Clicking a preset tab, or Alt+n for the n-th preset, SHALL open exactly its panes, in its order, with its divider fractions. The applied preset SHALL be highlighted. A later manual change SHALL mark it modified and offer "Update preset" and "Revert". Panes that no longer exist SHALL be skipped and named in a notice, with the rest sharing the width. A window resize SHALL keep the proportions.

#### Scenario: Switching presets
- **WHEN** the Operator presses Alt+2
- **THEN** the second preset's panes open in its order with its divider positions, and its tab is highlighted

#### Scenario: A tab that no longer exists
- **WHEN** a preset names a tab this build does not have
- **THEN** its other panes open and a notice names the missing tab

### Requirement: Presets persist per browser and on the hub
Presets SHALL be kept in the browser and in the hub (`GET/PUT /api/settings/view-presets`), so another browser pointing at the same hub sees them. A browser with no presets SHALL adopt the hub's list. While the two lists agree, edits SHALL be mirrored to the hub. When they differ, "Sync" SHALL write their union to both, with the browser's copy winning a conflict.

#### Scenario: Another browser
- **WHEN** the Operator opens the dashboard on a second browser that has no presets
- **THEN** the hub's presets show there and apply with the same panes and dividers
