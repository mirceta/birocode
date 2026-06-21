# Prompt library

## ADDED Requirements

### Requirement: Notes tab in the prompt pop-up

The system SHALL provide a third "Notes" tab in the chat composer's saved-prompts
pop-up, alongside the existing Prompts and Plans tabs, where the End User can create,
edit, delete, and list freeform working notes that have not yet been ported into a
prompt plan. Adding the Notes tab SHALL NOT remove or alter the Prompts or Plans tabs.

A note SHALL consist of a short title and a freeform text body.

#### Scenario: Create a note

- **WHEN** the End User opens the pop-up, switches to the Notes tab, enters a title and body, and saves
- **THEN** the note appears in the Notes list and the Prompts and Plans tabs remain unchanged

#### Scenario: Edit and delete a note

- **WHEN** the End User edits an existing note's title or body and saves, or deletes a note
- **THEN** the change is reflected in the Notes list immediately

#### Scenario: Empty note is rejected

- **WHEN** the End User tries to save a note with neither a title nor a body
- **THEN** the system does not persist an empty note

### Requirement: Notes are global and backend-synced

The system SHALL persist notes globally (not per-repo) on the backend so the note
library is shared across every chat composer and survives reloads and redeploys, using
the same durability as Prompts and Plans (atomic writes; an unreadable store is left
untouched rather than reseeded).

#### Scenario: Notes persist across reload

- **WHEN** the End User creates notes and later reloads the web UI
- **THEN** the previously created notes are still present

#### Scenario: Notes are shared across surfaces

- **WHEN** the End User opens the pop-up from a different chat surface on the same account
- **THEN** the same notes are listed

### Requirement: Notes are distinct from Ideas

The system SHALL keep prompt Notes in a separate store from the Ideas feature, so the
two never share or overwrite each other's data.

#### Scenario: Separate stores

- **WHEN** the End User saves a prompt Note and also has Ideas entries
- **THEN** the Note is written to the prompt-notes store and the Ideas list is unaffected

### Requirement: Notes tab respects the Advanced-mode gate

The system SHALL show the Notes tab only where the saved-prompts pop-up itself is
available — that is, behind the same Advanced-mode capability gate that controls the
pop-up — so Basic mode does not expose it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the saved-prompts pop-up and its Notes tab are not shown
