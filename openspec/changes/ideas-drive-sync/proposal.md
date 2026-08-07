## Why

The Ideas tab is one global board, but it is only global per harness: `NotesService`
persists to `%APPDATA%\ClaudeWeb\notes.json` on the box the harness runs on. The user
runs harnesses on multiple computers and wants one shared ideas board — the same list
visible and editable from every harness. The chosen shared home is a **single
JSON file on Google Drive**, reached the way the user asked for: by **pasting one
link**, with no service accounts or key files. Because the Drive API has no
anonymous write path (an "anyone with the link can edit" permission only works for
humans in the Drive web UI), the link is a **Google Apps Script web app URL** — a
short script (shipped in this repo) the user deploys once, which reads/writes the
Drive file on the harness's behalf.

## What Changes

- The ideas store gains a **sync layer**: each harness keeps its local `notes.json`
  as a working copy, and syncs it against one shared Drive-backed store (pull on
  interval, push after every mutation).
- Access is a **single web-app URL** pasted into each harness. The repo ships
  `docs/ideas-sync-appscript.gs`; the user pastes it into script.google.com, deploys
  it as a web app ("execute as me / anyone has access"), and copies the URL. The
  script owns the Drive file (created on first write) and serializes writes with a
  lock + revision counter (compare-and-swap).
- **Merge, not clobber**: notes merge by `Id` with newest-`UpdatedAt`-wins; deletions
  are recorded as tombstones in the shared store so a delete on one box doesn't
  resurrect from another. Local edits made while offline sync when connectivity
  returns.
- **Sync is configurable and optional**: a harness with no sync URL keeps today's
  purely-local behavior, unchanged.
- The **setting lives at the top of the Ideas panel**: a slim sync bar with the URL
  field, enable toggle, and live status (synced / syncing / offline / error + last
  sync time), so a stale board is visibly stale, never silently stale.

## Capabilities

### New Capabilities
- `ideas`: the global ideas board — one cross-project list of notes (text, optional
  project label, priority 0–5, active flag) served by the harness, plus the new
  shared-store sync: web-app-URL-backed replication between harnesses with per-note
  last-write-wins merge, delete tombstones, offline tolerance, and visible sync
  status. (Seeds the previously unspecced Ideas capability per seed-and-grow.)

### Modified Capabilities
<!-- none — no existing spec's requirements change -->

## Impact

- **Backend**: new `IdeasSyncService` (HTTP client against the configured URL, poll
  loop, CAS push, merge) alongside `ClaudeWeb.App/Services/Notes/NotesService.cs`;
  `NotesService` gains merge/tombstone support and a changed-notification hook;
  `NotesController` gains sync status + config endpoints; DI registration.
- **Frontend**: `client/src/components/ideas/IdeasPanel.jsx` — sync bar at the top
  of the panel (URL field + toggle + status chip, Advanced mode); i18n + CSS.
- **Storage**: `notes.json` schema gains a `Tombstones` list (backward compatible —
  older files load unchanged); new `%APPDATA%\ClaudeWeb\ideas-sync.json`
  (`Enabled`, `SyncUrl`, `PollSeconds`).
- **New repo artifact**: `docs/ideas-sync-appscript.gs` — the Apps Script the user
  deploys; treated as part of the shipped contract (stub tests mirror it).
- **External dependency**: none in code — plain `HttpClient` against the user's
  deployed web app; no Google SDK, no OAuth.
- **Human setup (user, once, ~2 min)**: paste the script at script.google.com,
  deploy as web app, paste the resulting URL into each harness — the agent account
  cannot create Google-side resources.
