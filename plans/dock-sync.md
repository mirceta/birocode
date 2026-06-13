# Dock Sync — agent tabs live on the backend

> **Status (2026-06-10):** Deployed to the live :5099 harness and confirmed
> by the End User. Browser-verified on an isolated :5200 instance:
> `.claudeweb-preview/playwright/verify-dock-sync.mjs` (two browser contexts:
> migration, open on A → visible on B, close on B → A converges) plus the
> chat regression tests (`verify-two-turns.mjs`, `verify-detached-runs.mjs`)
> all pass.

## Problem

Agent tabs (the Agents dock) are stored in `localStorage` (`DockContext.jsx`),
so each browser has its own private tab list. The runs themselves became
backend-owned in `plans/detached-runs.md`, but *which agents the End User has
open* is still per-device. Opening the app on a second device shows an empty
dock even while agents are running — confusing, and wrong for a 1–2 user
harness where the dock describes work happening on the host PC.

## Glossary

| Term | Definition |
|------|------------|
| **Dock** | The list of agent tabs shown in the Agents tab of the web UI. |
| **Dock Registry** | New backend singleton owning the persisted, authoritative tab list. |
| **Dock Tab** | One entry: `{ id, repoId, repoName, sessionId, status, createdAt, color, stash }`. (`color` added by plans/agent-color.md — optional highlight mark; `stash` added by plans/prompt-stash.md — stored prompt ideas.) |
| **Active Tab** | The tab a viewer is currently looking at. Deliberately NOT synced — stays **tab-local** (per browser tab; see "Per-tab spaces" below). |

## Design

Backend is the single source of truth for the tab list, mirroring
`RepositoryRegistry` (lock-guarded singleton persisted to
`%APPDATA%\ClaudeWeb\dock.json`).

Granular endpoints (not whole-list PUT) so two devices mutating at the same
time can't clobber each other's tabs; conflicts degrade to last-write-wins
per tab, which is fine for 1–2 users:

| Endpoint | Action |
|----------|--------|
| `GET /api/dock` | Full tab list. |
| `POST /api/dock` | Create a tab (server assigns id). |
| `PATCH /api/dock/{id}` | Partial update (sessionId, status, repoName). |
| `DELETE /api/dock/{id}` | Close a tab. |

Frontend `DockContext` drops the localStorage tab list:

- Load tabs from `GET /api/dock` on mount and on `visibilitychange` → visible
  (same reconcile triggers ChatContext already uses, so devices converge
  whenever you look at them — no realtime push).
- `openTab`/`closeTab`/`updateTab` call the API and update local state
  optimistically.
- `activeTabId` stays in localStorage (per-device view state).
- One-time migration: if the backend list is empty and `claudeweb_dock`
  exists in localStorage, push those tabs to the backend, then remove the key.

No UI-mode capability change: the Agents tab itself keeps its existing
visibility; no new UI surface is added.

### Per-tab spaces (2026-06-13)

The Active Tab was originally `localStorage` ("device-local"), but two tabs of
the same browser share `localStorage`, so they clobbered each other's active
agent on refresh. Refined to **tab-local** (`sessionStorage`, with a
`localStorage` seed). Full design + the affected keys live in
[per-tab-spaces](per-tab-spaces.md).

## Files touched

| File | Change |
|------|--------|
| `ClaudeWeb.App/Services/Dock/DockRegistry.cs` | New: persisted tab registry (pattern: RepositoryRegistry). |
| `ClaudeWeb.App/Services/Dock/DockModuleExtensions.cs` | New: `AddDockModule()`. |
| `ClaudeWeb.App/Services/EmbeddedApi.cs` | One line in the module-registration region. |
| `ClaudeWeb.App/Controllers/DockController.cs` | New: the four endpoints. |
| `client/src/context/DockContext.jsx` | Tabs from API; localStorage keeps only `activeTabId`; migration. |
| `client/src/api/client.js` | Nothing new expected (`apiGet`/`apiPost` etc. exist). |

## Risks

- **Status writes are now network calls.** ChatContext calls `updateTab`
  frequently during a turn (status changes). Mitigate: only PATCH when the
  patch actually changes the tab, and fire-and-forget with optimistic local
  state.
- **Offline/auth failure on load** → empty dock. Mitigate: keep last good
  list in memory; surface load errors in the existing error UI, don't wipe
  tabs on a failed refresh.
- **Two devices editing simultaneously** → per-tab last-write-wins, accepted.

## Verification

Playwright on the isolated :5200 instance (`docs/claude-web/browser-testing.md`):
two browser *contexts* (= two devices). Context A opens a tab and starts a
run; context B loads fresh and must show the same tab and attach to the run.
Close the tab in B; A (after visibility refresh) must lose it. Plus the
existing `verify-two-turns.mjs` and `verify-detached-runs.mjs` must still pass.

Same deploy safety as before: build isolated, test on :5200, never touch the
running :5099 harness until the user says deploy (dead-man's-switch routine).
