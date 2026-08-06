# agent-dock delta — alternate dock views keep the chat composer

## ADDED Requirements

### Requirement: Alternate dock views keep the chat composer visible

The system SHALL keep the chat composer (the prompt text box and its Send/Stop control)
visible and usable at the bottom of the dock screen whenever the operator opens any of the
agent dock's alternate views — a local app from the app switcher, the Event Console, or the
Files browser — rendering that view over the dock screen's chat area (the chat bar and the
message list). The composer SHALL behave exactly as it does when the chat is fully shown: typing,
sending, stopping, and prompt queueing all work, and an in-flight agent turn keeps streaming in
the background while the alternate view is open. Sending a prompt SHALL NOT close the alternate
view. Closing the alternate view SHALL restore the full chat view (bar, message list, composer)
without losing chat state.

#### Scenario: Opening a local app leaves the composer

- **WHEN** the operator opens a local app from the dock's app switcher
- **THEN** the app frame covers the chat bar and message list, and the chat composer remains visible and focusable below the app frame

#### Scenario: Opening the Event Console leaves the composer

- **WHEN** the operator opens the dock's Event Console view
- **THEN** the console covers the chat bar and message list, and the chat composer remains visible and focusable below it

#### Scenario: Opening the Files browser leaves the composer

- **WHEN** the operator opens the dock's Files view
- **THEN** the files browser covers the chat bar and message list, and the chat composer remains visible and focusable below it

#### Scenario: Sending a prompt while an alternate view is open

- **WHEN** the operator types a prompt in the composer and presses Send while a local app, the Event Console, or the Files view is open in the dock
- **THEN** the prompt is sent to the agent exactly as from the normal chat view, and the alternate view stays open

#### Scenario: Closing the alternate view restores the full chat

- **WHEN** the operator closes the open alternate view (toggles it off)
- **THEN** the dock shows the full chat again — bar, message list, and composer — with its state preserved (including any turn that streamed while the view was open)

### Requirement: Composer-under-view applies only to the agent dock

The system SHALL apply the composer-visible behavior only within the agent dock. The standalone
Local tab SHALL keep its existing full-area behavior, and each dock view SHALL remain behind
the same UI-mode gate that governs it today.

#### Scenario: The Local tab is unchanged

- **WHEN** the operator opens a local app from the standalone Local tab
- **THEN** the app fills the tab's body as it does today
