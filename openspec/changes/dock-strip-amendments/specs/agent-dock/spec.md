## ADDED Requirements

### Requirement: Dock toolbar tabs mark queued prompts

The dashboard's dock toolbar SHALL mark a dock's tab when that dock's agent has one or more
queued prompts (a non-empty per-agent prompt stash), extending the queued-prompt signal —
today carried only by dock-tile borders — to the strip. The marker SHALL use the queued
signal's existing near-black visual language, rendered as a ring around the tab's status
dot so it composes with, rather than replaces, the dot's other states: the assigned color
at rest, the near-black running presentation, and the unseen-result exclamation. The marker
SHALL appear on hidden docks' tabs too, so the operator can tell prompts are waiting on an
agent whose tile is not rendered. When the queue empties, the marker SHALL disappear
without a page reload. The tab's accessible label SHALL convey the queued state so the
ring never carries the meaning alone.

#### Scenario: Hidden dock with queued prompts is visible in the strip

- **WHEN** a dock is hidden from the dashboard grid and its agent has one or more queued prompts
- **THEN** the dock's toolbar tab shows the queued ring around its dot, and the tab's accessible label includes the queued state

#### Scenario: Queued ring composes with the dot's other states

- **WHEN** a dock's agent has queued prompts while the dot is showing its at-rest assigned color, the near-black running state, or the unseen-result exclamation
- **THEN** the queued ring renders around the dot in every case, hiding neither the dot state nor the exclamation

#### Scenario: The queue empties

- **WHEN** the last queued prompt for an agent is sent or removed
- **THEN** its toolbar tab's queued ring disappears without a page reload

### Requirement: Dock toolbar bulk show/hide controls

The dock toolbar SHALL offer two bulk visibility controls beside the reorder toggle: a
**show all** control that renders every roster dock in the dashboard grid, and a **hide
all** control that hides every roster dock (leaving the existing recoverable empty grid
with the strip still listing all tabs). Both SHALL act through the same per-dock
dashboard-visibility state and update path the individual tabs use, so the strip, the
grid, and the Agents-page visibility controls stay consistent, and SHALL NOT close, stop,
or delete any dock. A bulk control SHALL be disabled when it would change nothing (all
docks already shown, or already hidden) and while reorder mode is active. Both controls
SHALL carry accessible labels.

#### Scenario: Show all restores the full wall

- **WHEN** some docks are hidden from the grid and the operator activates the show-all control
- **THEN** every roster dock renders in the grid, all tabs show as active, and the Agents-page visibility toggles agree

#### Scenario: Hide all empties the grid recoverably

- **WHEN** the operator activates the hide-all control
- **THEN** every dock's tile is removed from the grid, the empty-state hint shows, all tabs remain in the strip as inactive, and no dock is closed or deleted

#### Scenario: No-op bulk controls are disabled

- **WHEN** every roster dock is already visible in the grid
- **THEN** the show-all control is disabled (and correspondingly hide-all is disabled when every dock is already hidden)

#### Scenario: Reorder mode suspends bulk controls

- **WHEN** the strip's reorder mode is active
- **THEN** both bulk controls are disabled, and they become usable again when the mode is exited
