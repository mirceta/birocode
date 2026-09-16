## ADDED Requirements

### Requirement: One transcript window for every conversation surface

The transcript render window SHALL be defined once — how many recent messages a
conversation shows by default and how many each "Show earlier" reveals
(`client/src/components/chat/transcriptWindow.js`) — and SHALL be read by every conversation
surface: the repo-agent chat and docks, and the arch / goal conversations. A surface
SHALL NOT carry its own copy of these numbers or its own window arithmetic.

#### Scenario: The dock and the arch conversation agree

- **WHEN** the repo-agent dock and an arch conversation each open a long thread
- **THEN** both show the same number of recent messages and reveal the same number per "Show earlier"

#### Scenario: Changing the window changes it everywhere

- **WHEN** the shared window constants change
- **THEN** every conversation surface follows without any other edit
