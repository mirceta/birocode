# chat — delta for fix-transcript-nul-freeze

## ADDED Requirements

### Requirement: Transcript reads survive corrupt lines
Every transcript reader SHALL skip a line it cannot parse and continue reading.
This covers all readers of a session `.jsonl` (visible messages, tool-call
history, session-list metadata): a corrupt line (e.g. a run of NUL bytes left
by a writer killed mid-append) costs at most that line, never the rest of the
transcript, and never removes the session from the session list. Before
parsing, a line SHALL be stripped of NUL characters so a real line merged with
crash-padding is recovered rather than lost.

#### Scenario: Conversation renders past crash-padding

- **WHEN** a transcript contains valid turns, then a run of NUL bytes, then
  further valid turns appended by the CLI
- **THEN** the transcript messages endpoint returns the turns from both sides
  of the corruption, so the rendered conversation is current, not frozen at
  the corruption point

#### Scenario: Tool calls pair across the corruption

- **WHEN** a `tool_use` line appears before a corrupt region and its
  `tool_result` after it
- **THEN** the reconstructed tool-call history pairs them as usual

#### Scenario: Corrupted session stays listed

- **WHEN** a session transcript contains an unparseable line
- **THEN** the session still appears in the session list, with its metadata
  (title, turn counts, last activity) derived from all parseable lines
