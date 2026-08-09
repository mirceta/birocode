# Chat

## MODIFIED Requirements

### Requirement: Expand the prompt draft in a large editor popup

The system SHALL let the End User open the current chat draft in a large editor popup from the
composer, edit it there, and close the popup to return to the composer with the edited draft
intact. The popup and the composer SHALL edit the same draft (a single source of truth), so
edits made in either are immediately reflected in the other. The popup SHALL NOT send the
draft and SHALL NOT clear it on close — sending remains an explicit composer action. The
expand control SHALL be gated on a UI-mode capability that defaults to Advanced.

When the prompt-stash capability is also enabled, the popup SHALL list the surface's queued
prompts — the same stash the composer strip shows and an armed queue loop unloads (the dock's
own tab when embedded, else the active tab's stash, else the main chat's global queue) —
below the editor, numbered in strip order, each with an insert action that appends the
prompt's text to the draft (blank-line separated when the draft is non-empty) without
sending, without removing the item from the queue, and without closing the popup. The popup
SHALL also offer an add-to-queue form (required text) that appends a new item to that same
stash, so it appears in the popup list and as a chip on the composer strip. Removing,
reordering, and sending queued prompts remain the composer strip's job, and the
custom-prompts library and fixed catalog SHALL NOT be listed in the popup.

#### Scenario: Open, edit, and return

- **WHEN** the End User taps the expand control on the composer
- **THEN** a large editor popup opens showing the current draft, and editing it updates the same draft the composer holds

#### Scenario: Close keeps the edit

- **WHEN** the End User closes the popup (close button, backdrop, or Esc) after editing
- **THEN** the popup dismisses, the edited draft remains in the composer, and nothing is sent or cleared

#### Scenario: Empty draft

- **WHEN** the End User opens the popup with an empty draft
- **THEN** the popup opens with an empty editor ready for input, and closing it leaves the draft empty

#### Scenario: Queued prompts listed

- **WHEN** the End User opens the popup while the surface's stash holds queued prompts
- **THEN** the popup lists them below the editor, numbered in the strip's order

#### Scenario: Insert appends to the draft without consuming the queue

- **WHEN** the End User taps a listed prompt's insert action while the editor holds a non-empty draft
- **THEN** the prompt's text is appended to the draft after a blank line, the item stays in the queue, the popup stays open, and nothing is sent

#### Scenario: Queue a prompt from the popup

- **WHEN** the End User submits the popup's add-to-queue form with text
- **THEN** a new item is appended to the surface's stash and appears in the popup's list (and on the composer strip) without closing the popup

#### Scenario: Prompt-stash capability off

- **WHEN** the prompt-stash capability is disabled for the device
- **THEN** the popup shows only the draft editor — no queued-prompts list and no add-to-queue form
