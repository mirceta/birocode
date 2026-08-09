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
