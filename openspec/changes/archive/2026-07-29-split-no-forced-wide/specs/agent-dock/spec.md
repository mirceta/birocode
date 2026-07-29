# agent-dock — delta for split-no-forced-wide

## REMOVED Requirements

### Requirement: A split dock widens in the dashboard grid

**Reason**: Widening is the user's explicit choice via the per-dock Wide (⤢)
toggle; split forcing it made the dock jump size and reflow its neighbors.
Split now renders within whatever cell width the dock already has.

## ADDED Requirements

### Requirement: Split fits the dock's existing cell

Entering or leaving split presentation SHALL NOT change the dock's dashboard
grid cell width. The per-dock wide (⤢) toggle SHALL keep working independently
of split — a dock manually widened stays wide through split transitions, and a
normal dock stays normal. The two panes SHALL fit the dock's actual width at
any cell size: the pane minimum-width floors SHALL adapt (shrinking
proportionally on narrow cells) so the split row never overflows the dock
horizontally, and the divider's drag clamp SHALL honor the same adapted floors.

#### Scenario: Entering split keeps the cell width

- **WHEN** a dock in a multi-column dashboard grid enters split with an app open
- **THEN** its grid cell keeps the width it had (no forced span), and other docks do not reflow

#### Scenario: Manual wide survives split transitions

- **WHEN** a dock marked wide via the ⤢ toggle enters and then leaves split
- **THEN** it remains wide throughout, and toggling ⤢ while split takes effect immediately

#### Scenario: Panes fit a normal-width cell

- **WHEN** a dock at normal (single-column) cell width is split
- **THEN** both panes and the divider render within the dock's width with no horizontal overflow, and dragging the divider clamps at floors scaled to that width
