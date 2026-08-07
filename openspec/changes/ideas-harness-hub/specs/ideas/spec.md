## ADDED Requirements

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
from session authentication, requests with a wrong token are rejected via
constant-time comparison with an `{ok:false, error}` body, and the token appears
in no log output. The token SHALL be stable across enable/disable cycles and
restarts.

#### Scenario: Wrong token
- **WHEN** a request arrives at the hub path with an incorrect token
- **THEN** it is rejected with an error envelope and no board data

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
