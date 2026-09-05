## ADDED Requirements

### Requirement: Side-by-side layout

The Management App SHALL offer two layouts, **Tabs** (one view at a time) and
**Side by side** (every visible view rendered as a resizable column), chosen from
its header and remembered per device.

#### Scenario: Switching to side by side

- **WHEN** the operator picks "Side by side" on a window at least 720 px wide
- **THEN** Arch, Ideas and Events render next to each other, each under a pane bar
  with its label and a hide control, and the choice persists across reloads

#### Scenario: Hiding and showing a pane

- **WHEN** the operator hides a pane (its × or its header button)
- **THEN** the remaining panes take the width, the header button shows it as off,
  and pressing that button again brings the pane back; the last visible pane cannot
  be hidden

#### Scenario: Resizing panes

- **WHEN** the operator drags the divider between two panes
- **THEN** those two panes trade width, the events iframe does not capture the drag,
  and the proportions persist across reloads

#### Scenario: Narrow window

- **WHEN** "Side by side" is chosen but the window is narrower than 720 px
- **THEN** the app renders tabs with a note, and returns to panes when the window is
  wide enough again
