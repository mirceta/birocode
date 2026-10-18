## ADDED Requirements

### Requirement: The arch's cached prompts have their own Management tab
The Management dashboard SHALL have a "Prompts" tab holding the arch agent's whole cached-prompt library (owner arch, the same store and seeding as before), grouped by category, searchable and filterable by origin (seeded / edited / custom), each prompt a card with its title, its template with placeholders drawn as chips, its hint, its origin (the Arch examples category it was seeded from), the tools that category leads to, and how often and when it was last used; the tab SHALL offer add, edit, duplicate, reorder, delete and re-seed from the Arch examples, where a re-seed adds missing categories only and keeps the Operator's edits.

#### Scenario: Browsing the library
- **WHEN** the Operator opens the Prompts tab
- **THEN** every cached prompt is a card under its category, with its placeholders as chips and its usage shown

#### Scenario: Re-seed keeps edits
- **WHEN** the Operator edited a seeded prompt and presses Re-seed from Arch examples
- **THEN** the edited prompt is unchanged and only missing categories are added

### Requirement: A prompt is used from the tab with live fill-ins
"Use" on a card SHALL open a fill-in sheet whose machine, agent, branch and card placeholders pick from the live arch state and task graph (free text otherwise), with a preview of the filled prompt; "Send to the arch" SHALL send it to the Operator-facing arch conversation once every placeholder is filled, and "Open in Arch chat" SHALL switch to the Arch tab with the prompt in the composer without sending it; each use SHALL be counted.

#### Scenario: Fill and send
- **WHEN** the Operator uses a prompt with a {machine} placeholder, picks a machine and presses Send to the arch
- **THEN** the filled text is sent to the arch conversation and the prompt's use count goes up by one

#### Scenario: Open in the chat
- **WHEN** the Operator presses Open in Arch chat
- **THEN** the Arch tab opens with the prompt appended to the composer, and nothing is sent

### Requirement: The Arch chat keeps one small prompts affordance
The Arch agent conversation SHALL NOT render the prompt library above its composer; its composer row SHALL offer a single "Prompts" button opening a compact searchable list of the cached prompts (most used first) whose click inserts the prompt into the draft, with a link to the Prompts tab inside the Management dashboard, and the composer's placeholder fill-in chips SHALL stay.

#### Scenario: Inserting from the chat
- **WHEN** the Operator presses Prompts in the Arch composer and clicks a prompt
- **THEN** it is inserted into the draft, its placeholders show as fill-in chips, and no library block appears above the chat
