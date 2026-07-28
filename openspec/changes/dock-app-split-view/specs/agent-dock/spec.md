# agent-dock — delta for dock-app-split-view

## ADDED Requirements

### Requirement: Side-by-side view mode for an opened local app

The system SHALL offer, per agent dock, a **split** presentation for the dock's opened
local app alongside the existing **cover** presentation. In split, the dock renders as
two side-by-side panes: the **left pane** SHALL contain the dock exactly as it renders
with no app open — dock header, lane switcher, local-apps switcher, the chat with its
full message list and composer, and the dock's other chrome per its usual visibility
rules — and the **right pane** SHALL contain the opened app's frame (the same
same-origin proxied frame as the cover presentation). In cover, behavior is unchanged:
the app takes the dock's surface and the chat collapses to its composer-only strip. The
operator SHALL be able to switch a dock between cover and split while an app is open,
via an explicit per-dock affordance. The mode SHALL be per-dock, device-local, and
ephemeral (like the dock's maximize-chat toggle): it SHALL NOT be shared between
devices and MAY reset on reload. Switching modes or opening/closing the app SHALL NOT
remount the dock's chat subtree and SHALL NOT reload the app frame: the frame keeps its
keep-alive identity, its per-frame zoom, and its in-app state across cover ↔ split
switches. Closing the app, or switching the dock to another full-surface view (files,
console), SHALL return the dock to its normal single-pane rendering. The split
affordance is an Advanced-mode affordance; the underlying ability to open a local app
remains governed by its existing gate.

#### Scenario: Split shows chat and app side by side

- **WHEN** the operator opens a local app in a dock and selects the split presentation
- **THEN** the dock shows its full normal content (including the chat's message list and composer) in a left pane and the opened app in a right pane, both visible and interactive at the same time

#### Scenario: Cover remains the existing behavior

- **WHEN** an app is open in cover presentation
- **THEN** the app occupies the dock's surface with the composer-only chat strip, exactly as before this change

#### Scenario: Switching modes preserves app and chat state

- **WHEN** the operator switches an open app between cover and split (in either direction)
- **THEN** the app frame is not reloaded — its in-app state and per-frame zoom persist — and the chat subtree is not remounted

#### Scenario: Closing the app leaves split cleanly

- **WHEN** the operator closes the opened app (or switches the dock to the files or console view) while in split
- **THEN** the dock returns to its normal single-pane rendering with no leftover second pane

#### Scenario: Split mode is per-dock and ephemeral

- **WHEN** the operator puts one dock into split while other docks have apps open
- **THEN** only that dock renders side-by-side, and the choice does not propagate to other docks, other devices, or (necessarily) across a reload

#### Scenario: Split affordance honors the Advanced gate

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the split affordance is not offered, and opening a local app uses the cover presentation

### Requirement: A split dock widens in the dashboard grid

While a dock is in split presentation with an app open, the system SHALL widen that
dock's cell in the dashboard grid (using the grid's existing wider-cell mechanism, e.g.
spanning an extra column) so the left pane retains a usable chat width rather than
halving a normal-width dock. When the dock leaves split (app closed or mode switched
back to cover), its cell SHALL return to the width it would otherwise have. The
widening SHALL degrade gracefully where extra width does not exist — a single-column
grid or a narrow free-layout panel SHALL still render both panes without breaking the
dashboard layout.

#### Scenario: Entering split widens the cell

- **WHEN** a dock in a multi-column dashboard grid enters split with an app open
- **THEN** that dock's cell becomes wider (spans an additional column) while other docks keep their normal width

#### Scenario: Leaving split restores the cell

- **WHEN** the dock leaves split presentation
- **THEN** its cell returns to the width it had before entering split (including a previously set per-dock wide flag)

#### Scenario: No room to widen still renders

- **WHEN** a dock enters split in a one-column grid or a narrow agents panel
- **THEN** the two panes still render side by side within the available width and the rest of the dashboard layout is not broken
