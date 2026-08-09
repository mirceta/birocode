# ideas — delta for sync-task-graph

## MODIFIED Requirements

### Requirement: Optional link-configured shared store
The harness SHALL support an optional sync configuration (sync endpoint URL + poll
interval + enabled flag). When sync is disabled or unconfigured, ideas behavior MUST
be purely local and identical to pre-sync behavior. When enabled, the harness SHALL
replicate the ideas board against the configured endpoint — a user-deployed Google
Apps Script web app fronting a single Drive file, or a harness hub — using plain
HTTP GET/POST with no Google authentication in the harness. The web-app script
SHALL be shipped in the repo as the authoritative endpoint contract. The shared
store payload SHALL carry the task graph section alongside the ideas board (see the
`taskgraph` capability): one sync configuration covers both boards, and a store
written by an older harness without the graph section MUST still merge cleanly (the
missing section is treated as empty and re-seeded by the next push).

#### Scenario: Unconfigured harness stays local
- **WHEN** no sync configuration exists
- **THEN** all ideas operations work exactly as before and the harness makes no
  outbound sync calls

#### Scenario: Configured harness syncs
- **WHEN** sync is enabled with a reachable endpoint URL
- **THEN** the harness begins pull/push replication of both the ideas board and the
  task graph against the shared store behind that URL

### Requirement: Harness-hosted shared store (hub)
The harness SHALL be able to act as the shared ideas store ("hub"): when hub
hosting is enabled, it SHALL serve the shared-store wire contract — `GET ?fn=get`
returning `{ok, rev, store}` and `POST {baseRev, store}` with compare-and-swap,
answering `{ok:false, conflict:true, rev, store}` on a stale `baseRev`, always as
HTTP 200 with errors in the body — at a token-bearing path
(`/api/notes/hub/{token}`), such that another harness's existing sync client works
against it unchanged. The hub's backing store SHALL be its own boards: the served
store carries both the ideas board and the task graph section, a remote POST
merges each board via its tombstone-aware merge (never overwrites hub-local
edits), and a local edit on the hub — to either board — SHALL advance the store
revision so polling harnesses converge. The revision SHALL persist across hub
restarts.

#### Scenario: Remote harness syncs through the hub
- **WHEN** harness B pastes hub A's URL into its sync configuration and enables sync
- **THEN** notes and task graph elements added on either A or B appear on the other
  within roughly one poll interval, and deletes carry over without resurrection

#### Scenario: CAS conflict at the hub
- **WHEN** two harnesses push overlapping changes and the second push carries a
  stale `baseRev`
- **THEN** the hub answers `conflict:true` with the current revision and store, and
  the retried merged push lands both writes

#### Scenario: Hub disabled
- **WHEN** hub hosting is disabled (or was never enabled)
- **THEN** the hub path answers `{ok:false, error}` and the harness serves no shared
  store
