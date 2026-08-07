# ideas Specification

## Purpose
The global ideas board: one harness-wide list of notes (text, optional project label,
priority, active flag) served over `/api/notes` and shown in the Ideas tab and dashboard
panel. Covers the optional cross-machine replication layer — a link-configured shared
store with pull/push CAS replication and per-note tombstone merge — and the harness's
ability to itself host that shared store ("hub") at a token-bearing path.
## Requirements

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

### Requirement: Harness-hosted shared store (hub)
The harness SHALL be able to act as the shared ideas store ("hub"): when hub
hosting is enabled, it SHALL serve the shared-store wire contract — `GET ?fn=get`
returning `{ok, rev, store}` and `POST {baseRev, store}` with compare-and-swap,
answering `{ok:false, conflict:true, rev, store}` on a stale `baseRev`, always as
HTTP 200 with errors in the body — at a token-bearing path
(`/api/notes/hub/{token}`), such that another harness's existing sync client works
against it unchanged. The hub's backing store SHALL be its own ideas board: a
remote POST merges via the per-note tombstone-aware merge (never overwrites
hub-local edits), and a local edit on the hub SHALL advance the store revision so
polling harnesses converge. The revision SHALL persist across hub restarts.

#### Scenario: Remote harness syncs through the hub
- **WHEN** harness B pastes hub A's URL into its sync configuration and enables sync
- **THEN** notes added on either A or B appear on the other within roughly one poll
  interval, and deletes carry over without resurrection

#### Scenario: CAS conflict at the hub
- **WHEN** two harnesses push overlapping changes and the second push carries a
  stale `baseRev`
- **THEN** the hub answers `conflict:true` with the current revision and store, and
  the retried merged push lands both writes

#### Scenario: Hub disabled
- **WHEN** hub hosting is disabled (or was never enabled)
- **THEN** the hub path answers `{ok:false, error}` and the harness serves no shared
  store

### Requirement: Hub access token
The hub URL SHALL embed a generated unguessable token (at least 256 bits of
randomness) that acts as the sole credential for the hub path: the path is exempt
from BOTH session authentication AND the IP allowlist gate (so a remote harness
syncs without the Operator approving its IP), requests with a wrong token are
rejected via constant-time comparison with an `{ok:false, error}` body, and the
token appears in no log output. The token SHALL be stable across enable/disable
cycles and restarts.

#### Scenario: Wrong token
- **WHEN** a request arrives at the hub path with an incorrect token
- **THEN** it is rejected with an error envelope and no board data

#### Scenario: Unapproved IP syncs via the hub URL
- **WHEN** a harness whose IP is not on the hub's guest allowlist calls the hub
  path with the correct token
- **THEN** the contract exchange succeeds — no Operator IP approval is needed for
  the hub path, and every other path from that IP is still rejected by the IP gate

#### Scenario: Session auth still gates everything else
- **WHEN** a request without a session or password header hits any other `/api`
  route
- **THEN** it is rejected exactly as before this change

### Requirement: Host-on-this-harness UI
The Ideas sync bar SHALL offer a hub section (Advanced mode): a toggle to enable
hosting and, once enabled, the ready-to-paste hub URL assembled from the browsing
origin plus the token, with a copy affordance. Hub state SHALL be readable and
writable only through the session-authenticated API.

#### Scenario: Operator enables hosting
- **WHEN** the operator enables "Host on this harness" in the sync bar
- **THEN** the bar shows the full hub URL under the origin they are browsing and
  copying it yields a URL another harness can paste directly

### Requirement: Sync URL scheme normalization
The sync configuration SHALL accept a pasted URL without a scheme by prefixing
`https://`; URLs with an explicit `http://` or `https://` scheme are stored
unchanged.

#### Scenario: Scheme-less paste
- **WHEN** the user pastes `host.example/api/notes/hub/abc` as the sync URL
- **THEN** the stored URL is `https://host.example/api/notes/hub/abc`
