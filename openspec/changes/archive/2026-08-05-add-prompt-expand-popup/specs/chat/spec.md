# Chat

## ADDED Requirements

### Requirement: Expand the prompt draft in a large editor popup

The system SHALL let the End User open the current chat draft in a large editor popup from the
composer, edit it there, and close the popup to return to the composer with the edited draft
intact. The popup and the composer SHALL edit the same draft (a single source of truth), so
edits made in either are immediately reflected in the other. The popup SHALL NOT send the
draft and SHALL NOT clear it on close — sending remains an explicit composer action. The
expand control SHALL be gated on a UI-mode capability that defaults to Advanced.

#### Scenario: Open, edit, and return

- **WHEN** the End User taps the expand control on the composer
- **THEN** a large editor popup opens showing the current draft, and editing it updates the same draft the composer holds

#### Scenario: Close keeps the edit

- **WHEN** the End User closes the popup (close button, backdrop, or Esc) after editing
- **THEN** the popup dismisses, the edited draft remains in the composer, and nothing is sent or cleared

#### Scenario: Empty draft

- **WHEN** the End User opens the popup with an empty draft
- **THEN** the popup opens with an empty editor ready for input, and closing it leaves the draft empty
