# Chat

## MODIFIED Requirements

### Requirement: Expand the prompt draft in a large editor popup

The system SHALL let the End User open the current chat draft in a large editor popup from the
composer, edit it there, and close the popup to return to the composer with the edited draft
intact. The popup and the composer SHALL edit the same draft (a single source of truth), so
edits made in either are immediately reflected in the other. The popup SHALL NOT send the
draft and SHALL NOT clear it on close — sending remains an explicit composer action. The
expand control SHALL be gated on a UI-mode capability that defaults to Advanced.

When the custom-prompts capability is also enabled, the popup SHALL list the End User's saved
custom prompts (the same global backend-synced store the prompt manager edits) below the
editor, each with an insert action that appends the prompt's text to the draft
(blank-line separated when the draft is non-empty) without sending or closing the popup. The
popup SHALL also offer a create form (optional label, required text) that saves a new custom
prompt into that same store, so it appears in the popup list, the prompt manager, and every
other composer. The fixed built-in catalog SHALL NOT be listed in the popup, and editing or
deleting saved prompts remains the prompt manager's job.

#### Scenario: Open, edit, and return

- **WHEN** the End User taps the expand control on the composer
- **THEN** a large editor popup opens showing the current draft, and editing it updates the same draft the composer holds

#### Scenario: Close keeps the edit

- **WHEN** the End User closes the popup (close button, backdrop, or Esc) after editing
- **THEN** the popup dismisses, the edited draft remains in the composer, and nothing is sent or cleared

#### Scenario: Empty draft

- **WHEN** the End User opens the popup with an empty draft
- **THEN** the popup opens with an empty editor ready for input, and closing it leaves the draft empty

#### Scenario: Saved prompts listed

- **WHEN** the End User opens the popup and has saved custom prompts
- **THEN** the popup lists them below the editor with their emoji and label

#### Scenario: Insert appends to the draft

- **WHEN** the End User taps a listed prompt's insert action while the editor holds a non-empty draft
- **THEN** the prompt's text is appended to the draft after a blank line, the popup stays open, and nothing is sent

#### Scenario: Create a saved prompt from the popup

- **WHEN** the End User submits the popup's create form with text
- **THEN** a new custom prompt is saved to the global store and appears in the popup's list without closing the popup

#### Scenario: Custom prompts capability off

- **WHEN** the custom-prompts capability is disabled for the device
- **THEN** the popup shows only the draft editor — no saved-prompts list and no create form
