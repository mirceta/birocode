## ADDED Requirements

### Requirement: Global ideas board
The harness SHALL maintain one global ideas list — notes with text, optional project
label, priority 0–5, and an active flag — served over `/api/notes` (list, add,
update, delete) and persisted locally with atomic writes, independent of which repo
is selected. (Seeds the existing behavior of `NotesService`; unchanged by sync.)

#### Scenario: Add and list from any device
- **WHEN** a note is added from any device browsing the harness
- **THEN** every device browsing that harness sees the note in the Ideas tab and the
  dashboard ideas panel

#### Scenario: Unreadable store is preserved
- **WHEN** the local notes store file is unreadable at startup
- **THEN** the harness starts with an empty in-memory board and leaves the file
  untouched for forensics (never reseeds over it)

### Requirement: Optional link-configured shared store
The harness SHALL support an optional sync configuration (sync endpoint URL + poll
interval + enabled flag). When sync is disabled or unconfigured, ideas behavior MUST
be purely local and identical to pre-sync behavior. When enabled, the harness SHALL
replicate the ideas board against the configured endpoint — a user-deployed Google
Apps Script web app fronting a single Drive file — using plain HTTP GET/POST with no
Google authentication in the harness. The web-app script SHALL be shipped in the
repo as the authoritative endpoint contract.

#### Scenario: Unconfigured harness stays local
- **WHEN** no sync configuration exists
- **THEN** all ideas operations work exactly as before and the harness makes no
  outbound sync calls

#### Scenario: Configured harness syncs
- **WHEN** sync is enabled with a reachable endpoint URL
- **THEN** the harness begins pull/push replication against the shared store behind
  that URL

### Requirement: Pull replication
When sync is enabled, the harness SHALL poll the shared store at the configured
interval (default 30 s), detect changes via the store's revision counter, and merge
remote changes into the local board, so an edit made on one harness appears on every
other harness within roughly one poll interval.

#### Scenario: Remote note appears
- **WHEN** harness A adds a note and pushes, and harness B's next poll runs
- **THEN** the note appears on harness B's board without any user action

### Requirement: Push replication with compare-and-swap
When sync is enabled, every local mutation (add, update, delete) SHALL schedule a
debounced push. A push MUST first pull and merge the current shared store, then
upload the merged result together with the revision it was based on; when the
endpoint reports a revision conflict, the harness SHALL re-merge against the
returned store and retry — a push never blindly overwrites remote content.

#### Scenario: Local add reaches the shared store
- **WHEN** a note is added locally and the debounce elapses
- **THEN** the shared store contains the merged board including the new note

#### Scenario: Conflicting push re-merges
- **WHEN** another harness writes the shared store between this harness's pull and
  push
- **THEN** the push is rejected with the newer store, and the harness re-merges and
  retries until it lands without overwriting the other write

### Requirement: Per-note merge with tombstones
Merging SHALL operate per note by `Id`: notes present on only one side are kept; when
both sides have a note, the newer `UpdatedAt` wins. Deletions SHALL be recorded as
tombstones (`Id` + deletion time) in both local and shared stores; a tombstone
newer than a note's `UpdatedAt` suppresses the note, while a note edited after its
deletion revives it. Tombstones older than the retention window (30 days) are pruned.
Legacy local stores without a tombstone list MUST load unchanged.

#### Scenario: Concurrent edits of the same note
- **WHEN** harness A and harness B both edit the same note while apart, then sync
- **THEN** both boards converge on the version with the newer `UpdatedAt`, and no
  other note is affected

#### Scenario: Delete does not resurrect
- **WHEN** harness A deletes a note while harness B is offline holding a copy, and B
  later syncs
- **THEN** the note stays deleted on both boards

### Requirement: Offline tolerance
Sync failures (no network, endpoint outage, quota) MUST NOT block or degrade local
ideas operations. The harness SHALL mark the board dirty on a failed push and retry
on subsequent poll ticks, converging once connectivity returns.

#### Scenario: Edit while offline
- **WHEN** the sync endpoint is unreachable and a note is added locally
- **THEN** the add succeeds immediately, and the note reaches the shared store after
  connectivity returns

### Requirement: Sync setting and status at the top of the Ideas panel
The Ideas panel SHALL surface the sync configuration (endpoint URL, enable toggle)
and the live sync state (disabled, synced, syncing, offline, error) with the last
successful sync time at the top of the panel, surfacing the last error when in the
error state. The sync bar is an Advanced-mode feature.

#### Scenario: Staleness is visible
- **WHEN** pushes or polls have been failing
- **THEN** the Ideas panel shows an offline/error state instead of appearing
  silently up-to-date

#### Scenario: Configure from the panel
- **WHEN** the user pastes the web-app URL into the sync bar and enables sync
- **THEN** replication starts without any harness restart or file editing on the box

### Requirement: Sync URL handled as a capability secret
The harness SHALL treat the sync endpoint URL as a capability secret, since anyone
who holds it can read and write the shared board: it SHALL be returned only over the
authenticated config API (so the field can be edited), MUST never be written to
logs, and MUST NOT be exposed on any unauthenticated surface.

#### Scenario: URL absent from logs
- **WHEN** sync runs, succeeds, fails, and retries
- **THEN** harness logs describe the outcomes without containing the endpoint URL
