# local-app-discovery — delta for local-apps-cache-export-import

## ADDED Requirements

### Requirement: Export cache as import-compatible JSON
The Local apps panel SHALL provide an Export action that displays the current
discovered-apps cache as pretty-printed JSON in the exact shape accepted by the
cache import endpoint: `{ "apps": [ { "name", "port", "folder", "evidence",
"startCommand" } ] }`. Machine-local projection fields (`running`,
`discoveredAt`) MUST NOT appear in the exported JSON.

#### Scenario: View cache as JSON
- **WHEN** the user opens the Local apps panel with cached findings present and
  activates Export
- **THEN** a read-only text area shows the findings serialized as
  `{ "apps": [...] }` with only the import-contract fields

#### Scenario: Export disabled with no cache
- **WHEN** the panel has no findings (no cache and no completed scan)
- **THEN** the Export action is disabled

#### Scenario: Round-trip to another machine
- **WHEN** the exported JSON is pasted into the Import action of a Local apps
  panel on another machine and submitted
- **THEN** the import succeeds without editing the payload and the findings are
  union-merged by port into that machine's cache

### Requirement: Copy exported JSON to clipboard
The Export view SHALL offer a one-click Copy action that places the exported
JSON on the clipboard, with confirmation feedback on success. When programmatic
clipboard access is unavailable (e.g. plain-HTTP browser context), the panel
SHALL fall back to selecting the visible JSON text and instructing the user to
copy manually; it MUST NOT present this as a failure of the export itself.

#### Scenario: Successful copy
- **WHEN** the user clicks Copy and the clipboard write succeeds
- **THEN** the button shows a transient copied confirmation

#### Scenario: Clipboard unavailable
- **WHEN** the user clicks Copy and both clipboard mechanisms fail
- **THEN** the JSON text is selected in the visible text area and a hint tells
  the user to copy manually (Ctrl+C)

### Requirement: Export and Import are mutually exclusive views
Within the Local apps panel, opening the Export view SHALL close the Import
view and vice versa, so only one paste/copy surface is visible at a time.

#### Scenario: Toggling between sections
- **WHEN** the Import section is open and the user activates Export
- **THEN** the Import section closes and the Export section opens
