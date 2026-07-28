## ADDED Requirements

### Requirement: Adjustable split ratio via a draggable divider

While a dock is in split presentation, the system SHALL render a draggable
vertical divider between the chat pane and the app pane, and dragging it
horizontally SHALL reallocate width between the two panes without reloading
the app frame or remounting the chat. The ratio SHALL be clamped so both
panes remain usable, and SHALL be per-dock and session-ephemeral.

#### Scenario: Dragging reallocates width

- **WHEN** the operator drags the divider horizontally (mouse or touch)
- **THEN** the chat and app panes resize live to follow the pointer, and the
  app iframe is not reloaded and the chat subtree is not remounted

#### Scenario: Drag crosses the app iframe

- **WHEN** the pointer moves over the embedded app frame mid-drag
- **THEN** the drag keeps tracking (the frame does not capture the pointer)
  and ends only when the operator releases

#### Scenario: Ratio is clamped

- **WHEN** the operator drags the divider toward either edge
- **THEN** the divider stops at the pane's minimum usable width (chat ≥
  300px, app ≥ 260px at normal zoom) instead of collapsing a pane

#### Scenario: Double-click resets

- **WHEN** the operator double-clicks the divider
- **THEN** the panes return to the 50/50 split

#### Scenario: Ratio persists per dock while mounted

- **WHEN** the operator sets a ratio, leaves split (or switches the opened
  app), and re-enters split on the same dock in the same session
- **THEN** the previously chosen ratio is restored, and other docks are
  unaffected

#### Scenario: Ratio is ephemeral

- **WHEN** the page is reloaded or the dock is closed and reopened
- **THEN** the split ratio starts back at 50/50 (no server or cross-device
  persistence)
