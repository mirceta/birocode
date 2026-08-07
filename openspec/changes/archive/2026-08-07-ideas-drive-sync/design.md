## Context

Ideas are one global list in `NotesService`
(`ClaudeWeb.App/Services/Notes/NotesService.cs`), persisted to
`%APPDATA%\ClaudeWeb\notes.json` with atomic temp+rename writes and a
never-reseed-on-unreadable load guard. All devices browsing one harness share the
board; harnesses on different computers do not. The user wants one board shared via
Google Drive, configured by **pasting a single link** — no service accounts, no key
files per box. Constraints: the harness runs on Windows Server 2019 (no Google Drive
for Desktop support), boxes may be offline at times, and both harnesses may edit the
board close together in time.

**Why not a literal "anyone with the link can edit" Drive file:** that permission
only applies to humans in the Drive web UI. The Drive REST API has no anonymous
write path — API keys allow public *reads* only; every upload requires an OAuth'd
identity, i.e. exactly the service-account machinery the user rejected. The closest
thing to "just a link" that a headless server can write through is a **Google Apps
Script web app**: the user pastes a short script (shipped in this repo) into
script.google.com, deploys it as "execute as me / anyone has access", and gets one
`https://script.google.com/macros/s/<id>/exec` URL. The script reads/writes a JSON
file in the user's own Drive; the harness just GETs and POSTs that URL.

## Goals / Non-Goals

**Goals:**
- One shared ideas board across N harnesses, converging via one Drive-backed store.
- Setup = paste one URL into each harness. No keys, no GCP project, no per-box files.
- No regression when sync is unconfigured — purely local behavior stays identical.
- No lost notes: merge per note, never whole-file clobber; deletes don't resurrect.
- Offline-tolerant: local edits always work; sync catches up.
- Visible sync state and the sync setting at the top of the Ideas panel.

**Non-Goals:**
- Real-time collaborative editing (sub-second convergence, cursors). Poll-based
  convergence within ~30 s is the target.
- Syncing anything beyond the ideas list (prompt notes, arch plan, pins stay local).
- Any Google authentication in the harness — the web-app URL is the whole story.
- Field-level merge of a single note's text (note-level last-write-wins is enough).

## Decisions

**D1 — Shared store = a user-deployed Google Apps Script web app, not the Drive API.**
The repo ships `docs/ideas-sync-appscript.gs` (~40 lines). The user pastes it into a
new script.google.com project and deploys it as a web app ("execute as me", "anyone
has access"). The script owns a `claude-web-ideas.json` file in the user's Drive
(found by name, created on first write — nothing to share, no file ID to copy) and
exposes: `GET ?fn=get` → `{ok, rev, store}` and `POST {baseRev, store}` →
`{ok, rev}` or `{ok:false, conflict:true, rev, store}`. Writes run under
`LockService` with a revision counter, giving **compare-and-swap** — strictly better
concurrency than the Drive API's unconditional media PATCH. Alternatives rejected:
service account (user rejected the key/GCP setup), anyone-can-edit file via API
(no anonymous write path exists), OAuth desktop flow (interactive consent per box).

**D2 — Harness transport: plain `HttpClient` against the configured URL.**
No Google SDK, no auth code — just JSON over GET/POST to `SyncUrl`. Apps Script
quirks handled explicitly: responses arrive via a 302 redirect to
`script.googleusercontent.com` (default `HttpClientHandler` follows it; the
POST→GET downgrade on redirect is how Apps Script serves POST responses — expected,
not a bug); the web app always answers HTTP 200, so errors are detected from the
JSON body (`ok:false` / non-JSON HTML error page), never from status codes. Tests
point `SyncUrl` at a local stub implementing the same contract.

**D3 — Shared-store schema = local schema + tombstones + revision.**
The shared JSON holds `{ Rev, Ideas: [Note], Tombstones: [{Id, DeletedAt}] }` — the
same `Note` shape as `notes.json`. Local `notes.json` gains the same optional
`Tombstones` list (older files deserialize unchanged; `System.Text.Json` fills the
missing field). Tombstones are pruned after 30 days to keep the file small.

**D4 — Merge: per-note last-write-wins + tombstones.**
Union both sides by `Id`; when both have a note, newest `UpdatedAt` wins. A tombstone
beats a note when `DeletedAt >= UpdatedAt`, else the newer edit revives the note
(edit-after-delete is a deliberate revival). Merge is deterministic and commutative,
so pull-merge and push-merge use the same function. Relies on roughly-sane wall
clocks across boxes — acceptable for a personal ideas board (see R2).

**D5 — Sync choreography: poll-pull + debounced pull-merge-CAS-push.**
A `BackgroundService` (`IdeasSyncService`) GETs the web app every `PollSeconds`
(default 30); when `rev` differs from the last seen, it merges the returned store
into `NotesService` and saves. Every local mutation raises a `Changed` event; the
sync service debounces (~2 s), pulls + merges, then POSTs the merged store with
`baseRev`. On a conflict response (someone else wrote in between) it re-merges
against the returned store and retries — the lost-update race the raw Drive API
would have (old R1) is eliminated at the store level; per-note LWW still decides
truly simultaneous edits of the *same* note. Failed pushes set a dirty flag retried
on every poll tick.

**D6 — `NotesService` stays the single owner of local state.**
It gains: tombstone recording on delete, a `Changed` event, `Snapshot()` and
`MergeFrom(remote)` (both under the existing `_gate`; `MergeFrom` saves and reports
whether anything changed). The sync service holds no note state of its own — it is
transport + merge orchestration only. The `/api/notes` CRUD surface is untouched.

**D7 — Config + status API; setting lives at the top of the Ideas panel.**
`%APPDATA%\ClaudeWeb\ideas-sync.json`: `{ Enabled, SyncUrl, PollSeconds }`.
Endpoints on `NotesController`: `GET/PUT /api/notes/sync/config` and
`GET /api/notes/sync/status` (`state: disabled|synced|syncing|offline|error`,
`lastSyncAt`, `lastError`). Per the user's ask, the setting sits **at the top of
`IdeasPanel.jsx`**: a slim sync bar with the paste-the-link URL field, an
enable toggle, and the live status chip (collapsed to just the chip once
configured; click to expand and edit). The bar is `'advanced'` in the UI-mode
capability map per the New-UI-features-default-Advanced convention. The URL is a
bearer capability (anyone holding it can read/write the board): it round-trips
through the authenticated config API so the field can be edited, but is never
written to logs.

**D8 — Verification: stubbed web app, isolated port.**
E2e runs a local HTTP stub implementing the web-app contract (get/CAS-post,
including the 302-redirect response shape) against two harness instances on isolated
ports sharing the stub store, exercising: add propagates, concurrent edit LWW,
CAS conflict retry, delete tombstone (no resurrect after offline box returns),
offline queue + recovery, unconfigured = zero outbound calls. No test talks to real
Google. A one-time manual smoke against the real deployed script validates the
Apps Script quirks (redirect chain, HTML error pages).

## Risks / Trade-offs

- **[R1] ~~Push race~~ — resolved by CAS**: `LockService` + `baseRev` in the script
  serializes writers; a conflicting push re-merges and retries. The remaining
  conflict surface is two boxes editing the *same note* within one debounce window, where
  per-note LWW picks the newer edit. Accepted.
- **[R2] Clock skew between boxes breaks LWW ordering** → timestamps are
  server-stamped per harness (existing `UpdatedAt` mechanism); boxes are NTP-synced
  Windows machines. Skew of seconds only matters for near-simultaneous edits of the
  same note. Accepted.
- **[R3] The web-app URL is a bearer capability** → anyone who obtains it can read
  and write the ideas board (and only that — the script touches one file). Same
  risk profile as the "anyone with the link" sharing the user asked for, and
  consistent with their accepted /preview/ posture. URL never logged; revocable any
  time by disabling the script's deployment.
- **[R4] Apps Script quotas / latency / outage** → calls take ~0.5–1.5 s and
  consumer quotas allow far more than two boxes polling at 30 s (~5.8k calls/day).
  On failure sync degrades to `offline`, board stays usable locally, dirty flag
  retries; UI chip makes staleness visible.
- **[R5] Redeploying the script can mint a new URL** → the setup doc says to use
  "Manage deployments → edit → new version", which keeps the URL stable; a changed
  URL just means pasting the new one into each harness.
- **[R6] A second sync writer on the same box (e.g. zombie harness)** → same
  merge-not-clobber + CAS semantics apply; converges. Existing zombie-process
  hygiene notes still apply.

## Migration Plan

1. Ship code; sync defaults to disabled — zero behavior change everywhere.
2. User (once, ~2 min): script.google.com → new project → paste
   `docs/ideas-sync-appscript.gs` → Deploy as web app ("execute as me", "anyone has
   access") → copy the `/exec` URL. (The script creates `claude-web-ideas.json` in
   their Drive on first write — nothing to pre-create or share.)
3. Paste the URL into the sync bar at the top of the Ideas panel on each harness and
   enable.
4. Rollback: disable sync (or delete `ideas-sync.json`) — local boards keep their
   last-merged state and diverge independently again. Disabling the script's
   deployment revokes all access. No data migration either way.

## Open Questions

- None blocking. (Poll interval and tombstone retention are config/constants with
  sane defaults; both are trivially tunable later.)
