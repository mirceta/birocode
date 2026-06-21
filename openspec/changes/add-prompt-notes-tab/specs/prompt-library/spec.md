# Prompt library

## ADDED Requirements

### Requirement: Notes tab in the prompt pop-up

The system SHALL provide a third "Notes" tab in the chat composer's saved-prompts
pop-up, alongside the existing Prompts and Plans tabs, that presents a SINGLE freeform
text canvas the End User reads and edits — working notes not yet ported into a prompt
plan. Adding the Notes tab SHALL NOT remove or alter the Prompts or Plans tabs.

The canvas SHALL be resizable so the End User can enlarge it for reading and editing.

The canvas SHALL autosave shortly after the End User stops typing, AND the tab SHALL
also provide an explicit Save control; both persist the same single document. The tab
SHALL surface save state (e.g. saving / saved / unsaved).

#### Scenario: Edit the canvas

- **WHEN** the End User opens the pop-up, switches to the Notes tab, and types into the canvas
- **THEN** the text autosaves shortly after they stop typing, the Save control also persists on demand, and the Prompts and Plans tabs remain unchanged

#### Scenario: Resize the canvas

- **WHEN** the End User drags the canvas larger
- **THEN** the canvas grows so more text is visible for reading and editing

#### Scenario: Clearing the canvas is allowed

- **WHEN** the End User deletes all text and saves
- **THEN** the system persists an empty canvas (there is no required content)

### Requirement: Notes are global and backend-synced

The system SHALL persist the notes canvas globally (not per-repo) on the backend so it
is shared across every chat composer and survives reloads and redeploys, using the same
durability as Prompts and Plans (atomic writes; an unreadable store is left untouched
rather than reseeded).

#### Scenario: Canvas persists across reload

- **WHEN** the End User edits the canvas and later reloads the web UI
- **THEN** the previously saved canvas text is still present

#### Scenario: Canvas is shared across surfaces

- **WHEN** the End User opens the pop-up from a different chat surface on the same account
- **THEN** the same canvas text is shown

### Requirement: Notes are distinct from Ideas

The system SHALL keep the prompt-notes canvas in a separate store from the Ideas
feature, so the two never share or overwrite each other's data.

#### Scenario: Separate stores

- **WHEN** the End User saves the prompt-notes canvas and also has Ideas entries
- **THEN** the canvas is written to the prompt-notes store and the Ideas list is unaffected

### Requirement: Notes tab respects the Advanced-mode gate

The system SHALL show the Notes tab only where the saved-prompts pop-up itself is
available — that is, behind the same Advanced-mode capability gate that controls the
pop-up — so Basic mode does not expose it.

#### Scenario: Hidden in Basic mode

- **WHEN** the web UI is in Basic (Simple) mode
- **THEN** the saved-prompts pop-up and its Notes tab are not shown
