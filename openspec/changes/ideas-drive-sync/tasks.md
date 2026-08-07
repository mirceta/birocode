## 1. Store foundations (NotesService)

- [x] 1.1 `NotesService`: add `Tombstones` to the on-disk `Store` (optional — legacy
  files load unchanged), record a tombstone on `Delete`, prune tombstones older than
  30 days on save
- [x] 1.2 `NotesService`: add `Changed` event (raised after any successful mutation),
  `Snapshot()` (ideas + tombstones under `_gate`), and `MergeFrom(remote)` — per-Id
  newest-`UpdatedAt`-wins with tombstone suppression/revival, saves and returns
  whether local state changed

## 2. Endpoint contract + sync service

- [x] 2.1 `docs/ideas-sync-appscript.gs`: the shipped Apps Script — `doGet` returns
  `{ok, rev, store}` from `claude-web-ideas.json` (created empty on first use),
  `doPost` under `LockService` compares `baseRev`, writes and bumps `rev` on match,
  returns `{ok:false, conflict:true, rev, store}` on mismatch; plus a short
  deploy-instructions header comment ("execute as me / anyone has access"; edit
  deployments in place to keep the URL stable)
- [x] 2.2 `IdeasSyncConfigStore`: `%APPDATA%\ClaudeWeb\ideas-sync.json`
  (`Enabled`, `SyncUrl`, `PollSeconds`) with atomic write + tolerant load
- [x] 2.3 `IdeasSyncClient` (plain `HttpClient`): `GetAsync()` / `PostAsync(baseRev,
  store)` against `SyncUrl`; follows the Apps Script 302-redirect response shape;
  treats non-JSON or `ok:false` bodies as errors (web apps always answer HTTP 200);
  never logs the URL
- [x] 2.4 `IdeasSyncService` (BackgroundService): poll loop (rev-compare pull-merge),
  debounced pull-merge-CAS-push on `Changed` with conflict re-merge retry,
  dirty-flag retry on failed push, status snapshot
  (`disabled|synced|syncing|offline|error`, `lastSyncAt`, `lastError`); DI
  registration

## 3. API + frontend

- [x] 3.1 `NotesController`: `GET/PUT /api/notes/sync/config` and
  `GET /api/notes/sync/status`
- [x] 3.2 `IdeasPanel.jsx`: sync bar at the top of the panel — URL field + enable
  toggle + status chip (collapses to the chip once configured; click to expand and
  edit); poll status while visible
- [x] 3.3 CSS + i18n (en/tr) + `UiModeContext` capability entry (`'advanced'`)

## 4. Verify

- [x] 4.1 Local stub implementing the web-app contract (get / CAS-post / conflict /
  redirect shape) for e2e; no test talks to real Google
- [x] 4.2 Isolated-port e2e: two harnesses against the stub — add propagates,
  concurrent-edit LWW, CAS conflict re-merge lands both writes, delete tombstone
  survives an offline box returning, offline edits queue + recover, unconfigured
  harness makes zero outbound sync calls
- [x] 4.3 Playwright: sync bar (paste URL → enable → status chip) on isolated port
- [x] 4.4 `openspec validate ideas-drive-sync --strict`

## 5. Docs + wrap-up

- [x] 5.1 Understanding app: overwrite with the shipped sync architecture (honesty
  pass — reflect what was built, not the options pitch)
- [x] 5.2 README note: the one-time Apps Script deploy (paste `.gs`, deploy as web
  app, copy URL) for the operator
- [ ] 5.3 Commit on a feature branch; real-endpoint manual smoke deferred until the
  user deploys the script and provides the URL
