# Render Files-tab functionality in the agent dock

> **Status:** ✅ **Shipped** — user-confirmed working, merged to main 2026-06-19.
> On `feature/agent-dock-files-tab` (branched off synced `main` 2026-06-19).
> **Corrected design:** Files is a **tab INSIDE each agent dock** (the
> `PinnedAgent` phone), a sibling of the Builder/Ask lanes and the local-app
> buttons that swaps `phone__screen` to the shared `FilesBrowser` scoped to that
> agent's repo — **not** a standalone dashboard citizen beside Ideas/Autopilot
> (the first attempt; reverted). Full parity via the shared `FilesBrowser` (tree ·
> viewer · pins · live poll · doc-links). Follow-ups shipped in the same branch:
> the in-dock surface **scrolls within the phone** (its roots carry no scroll
> frame, so they're flex-filled + `overflow-y:auto` under `.phone__screen`), and
> the **git block is hidden while Files is open** so the browser gets the full
> dock height. Frontend-only (reuses `FileController` via `X-Repo-Id`).

## Goal

Surface the **Files tab**'s browse-and-view capability **inside each agent dock**
(the per-agent "phone" on the dashboard), so a repo's files are reachable right
where you watch that agent — not only from the dedicated Files tab. It reads as a
third screen the dock can show, beside its chat and its local apps.

## Surfaces (mapped)

**Files tab** (the thing to reuse):
- `client/src/pages/Files.jsx` — tree browser + viewer + pins + 5s live poll +
  doc-link back/forward nav.
- `client/src/components/files/FileList.jsx` — recursive tree, lazy folder load,
  long-press → @reference into the chat composer.
- `client/src/components/files/FileViewer.jsx` — markdown / sandboxed-HTML /
  image / plain-text rendering, raw↔rendered toggle, pin toggle.
- Backend `ClaudeWeb.App/Controllers/FileController.cs`:
  `GET /api/files?path=`, `GET /api/files/read?path=`, `GET /api/files/raw?path=`
  — all **repo-scoped via the `X-Repo-Id` header**, which the API helper
  (`client/src/api/client.js`) sets from `{ repoId }` per call. Path-traversal
  is rejected server-side (403/400/415). **No backend change expected.**

**Agent dock** (the host):
- `client/src/pages/Dashboard.jsx` — free/grid drag layout; citizens registered
  in the `dragKeys` array and rendered as `data-panel="…"` sections with a `⠿`
  grip; positions/sizes persisted in localStorage. Existing citizens: Autopilot,
  Ideas, Task graph; plus the **agents grid** (one card/phone per dock tab).
- `client/src/context/DockContext.jsx` — `tabs[]`, `activeTab`, each tab has a
  `repoId`/`repoName`. This is the per-agent scope a dock view can target.
- Reference dock components for the add-a-dock pattern (size/collapse/resize
  grip): `components/dashboard/AutopilotPanel.jsx`,
  `components/taskgraph/TaskGraphPanel.jsx`.

## Approach (as built)

1. **Extract a shared component.** Pull the Files internals (tree + viewer +
   state) out of `Files.jsx` into a reusable `FilesBrowser` that takes a
   `repoId` prop and scopes every API call to it. The Files **tab** becomes a
   thin wrapper around it — same "one shared component, two surfaces" pattern the
   repo used for `AutopilotConsole`, so the two can't drift.
   (`components/files/FilesBrowser.jsx`.)
2. **Render it inside the agent dock.** In `components/dashboard/PinnedAgent.jsx`
   (the per-agent "phone"), add a **📁 Files** tab to the existing
   `phone__lanes` row, beside **Builder/Ask**. Picking it sets `showFiles` and
   swaps `phone__screen` to `<FilesBrowser repoId={tab.repoId} />` — scoped to
   THAT agent's repo. Files / local-app / chat are mutually exclusive screens:
   picking a chat lane or a local app clears `showFiles`, and picking Files
   clears the open app. Gated on the `filesDock` feature.
3. **UI mode:** `filesDock` registered as **Advanced** in
   `client/src/context/UiModeContext.jsx` (new features default Advanced).
4. **Build + browser-verify** (`docs/claude-web/browser-testing.md`) before
   claiming it works; self-dev isolated build per `docs/claude-web/self-dev.md`.

## Decisions (resolved)

1. **Dock target / scoping** — **per-agent, in-dock tab.** Each phone browses
   *its own* repo via `tab.repoId`. (The first attempt put a single standalone
   Files dock beside Ideas/Autopilot — rejected; the user wanted it *inside* the
   agent docks. That `FilesPanel.jsx` / `files-panel.css` / `dash__files` dock
   were removed.)
2. **Feature depth** — **full parity** via the shared `FilesBrowser` (tree +
   viewer + markdown/HTML/image + pins + doc-link nav).
3. **Pins/poll** — kept: the shared component runs its own 5s poll + per-project
   pins, same as the routed tab.

## Out of scope

- File **editing** — this is browse + view only.
- Backend changes — the existing `FileController` already serves any repo via
  `X-Repo-Id`.
