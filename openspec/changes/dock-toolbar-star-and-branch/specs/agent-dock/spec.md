# Delta: agent-dock — dock-toolbar-star-and-branch

## ADDED Requirements

### Requirement: Dock toolbar tabs mark important docks with a star

The dashboard's dock toolbar SHALL render a star indicator on the right side
of a dock's tab when that dock's server-persisted `important` flag is set —
the same flag toggled by the dock panel's and grid cell's star control. The
star SHALL use the same gold "important" visual language as the existing
star controls, SHALL be display-only (clicking the tab keeps its existing
single action: toggling the dock's grid visibility), and SHALL appear for
hidden docks' tabs too. When the flag is cleared the star SHALL disappear
without a page reload. The tab's accessible label SHALL convey the important
state so the glyph never carries the meaning alone.

#### Scenario: Important dock shows a star on its tab

- **WHEN** a dock's `important` flag is set and the Dashboard is open
- **THEN** that dock's toolbar tab shows a gold star on its right side, whether or not the dock is currently rendered in the grid

#### Scenario: Toggling importance elsewhere updates the strip

- **WHEN** the operator toggles a dock's star in the dock panel or grid cell while the Dashboard is open
- **THEN** the toolbar tab's star appears or disappears to match, without a page reload

#### Scenario: The star is not a control

- **WHEN** the operator clicks anywhere on a tab that shows a star
- **THEN** the click performs the tab's existing hide/show toggle and the dock's `important` flag is unchanged

#### Scenario: Important state is accessible

- **WHEN** a tab's dock is marked important
- **THEN** the tab's accessible label (aria-label/title) includes the important state

### Requirement: Dock toolbar tabs show the dock's git branch

Each dock toolbar tab SHALL show the current git branch of the dock's repo
as a second row beneath the dock's name, reusing the branch the dashboard
already fetches per repo (`/git/status` → branch); the toolbar SHALL NOT
introduce its own git polling. When no branch is known for the repo (fetch
pending, repo unreadable, or branch reported as `unknown`), the tab SHALL
render without the branch row rather than showing a placeholder. Branch data
is per-repo: docks sharing a repo show the same branch. The tab's accessible
label SHALL include the branch when one is shown.

#### Scenario: Tab shows the repo's branch

- **WHEN** the Dashboard is open and the dashboard's git status for a dock's repo reports branch `feat/x`
- **THEN** that dock's toolbar tab shows `feat/x` on a second row beneath the dock's name, including when the dock is hidden from the grid

#### Scenario: No branch data, no row

- **WHEN** the git status for a dock's repo is not yet loaded, failed, or reports branch `unknown`
- **THEN** the tab renders single-line, with no branch row and no placeholder text

#### Scenario: Branch refresh propagates to the strip

- **WHEN** the dashboard's per-repo git status refreshes and the branch value changes
- **THEN** the toolbar tab's branch row updates to the new value without a page reload

#### Scenario: Branch is accessible

- **WHEN** a tab shows a branch row
- **THEN** the tab's accessible label (aria-label/title) includes the branch name

### Requirement: The dock roster order is operator-controlled and shared by strip and grid

The system SHALL treat the persisted dock roster's list order as the single
display order for agents: the dock toolbar SHALL render its tabs in exactly
that order, and the dashboard grid SHALL render the grid-visible docks in
that same relative order (the existing dependent-"together" grouping MAY
still place a dependent dock beneath its primary). The former automatic
ordering — important docks pinned first, remaining docks sorted by recency —
SHALL no longer apply; the `important` flag and recency SHALL keep their
other surfaces (star, borders, "show only important" filter) without moving
agents. The roster order SHALL be persisted server-side with the roster
itself, so it survives reloads and is shared across devices; newly opened
docks SHALL append at the end of the order.

#### Scenario: Strip order is grid order

- **WHEN** the Dashboard is open and the roster order places dock A before dock B, both grid-visible and neither in a dependent group
- **THEN** the strip shows A's tab before B's tab and the grid renders A's panel before B's panel

#### Scenario: Importance no longer repositions a dock

- **WHEN** the operator toggles a dock's `important` flag
- **THEN** the dock's position in the strip and the grid is unchanged (only star/border/filter surfaces react)

#### Scenario: Order survives reload and is shared across devices

- **WHEN** the operator reorders the roster and later reloads the Dashboard, or opens it signed in from another device
- **THEN** the strip and grid render the persisted order, not creation or recency order

### Requirement: The dock toolbar provides a click-based reorder mode

The dock toolbar SHALL provide a reorder mode, entered and exited via a
dedicated toggle control on the strip. While the mode is active, clicking a
tab SHALL pick it up (visibly marked), clicking a different tab SHALL move
the picked tab to the clicked tab's position — before it when moving toward
the front, after it when moving toward the back, so both ends of the order
are reachable — and clicking the picked tab again SHALL cancel the pick.
While the mode is active, tab clicks SHALL NOT toggle dock visibility;
exiting the mode SHALL restore the tabs' normal hide/show click. A completed
move SHALL update the strip and grid immediately and persist the new roster
order to the server. The toggle control and the picked state SHALL have
accessible labels.

#### Scenario: Reorder with two taps

- **WHEN** reorder mode is on and the operator taps dock B's tab and then dock A's tab (A ahead of B in the order)
- **THEN** B moves to A's position ahead of A, the strip and grid re-render in the new order immediately, and the order is persisted

#### Scenario: Both ends are reachable

- **WHEN** reorder mode is on and the operator taps the picked tab's target as the first tab, or as the last tab
- **THEN** the picked dock can land at the very front (before the first) or the very back (after the last) of the order

#### Scenario: Reorder mode suspends hide/show

- **WHEN** reorder mode is on and the operator taps any tab
- **THEN** no dock's grid visibility changes; after the mode is toggled off, tapping a tab hides/shows its dock as before

#### Scenario: Cancelling a pick

- **WHEN** reorder mode is on and the operator taps a tab and then taps the same tab again
- **THEN** the pick is cancelled and the order is unchanged
