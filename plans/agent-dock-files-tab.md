# Render Files-tab functionality in the agent dock

> **Status:** Active — design, not built. On `feature/agent-dock-files-tab`.
> Branch off synced `main` 2026-06-19.

## Goal

Surface the **Files tab**'s browse-and-view capability inside the **agent dock**
on the dashboard, so a repo's files are reachable from the dock — not only from
the dedicated Files tab.

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

## Approach (default — pending the open questions)

1. **Extract a shared component.** Pull the Files internals (tree + viewer +
   state) out of `Files.jsx` into a reusable `FilesBrowser` that takes a
   `repoId` prop and scopes every API call to it. The Files **tab** becomes a
   thin wrapper around it — same "one shared component, two surfaces" pattern the
   repo used for `AutopilotConsole`, so the two can't drift.
2. **Render it in the dock**, scoped to the agent's `repoId` (from
   `DockContext`), per whichever dock target we pick below.
3. **UI mode:** register the new surface as **Advanced** in
   `client/src/context/UiModeContext.jsx` (new features default Advanced).
4. **Build + browser-verify** (`docs/claude-web/browser-testing.md`) before
   claiming it works; self-dev isolated build per `docs/claude-web/self-dev.md`.

## Open questions (defaults chosen; confirm before building)

1. **Dock target / scoping** — default **per-agent** (each agent's card/panel
   browses *its* repo via `activeTab.repoId`). Alternatives: one **global** Files
   dock (sibling of Ideas/Autopilot, scoped to the selected repo); or a
   per-agent **viewer-only** mini panel.
2. **Feature depth** — default **full parity** via the shared component (tree +
   viewer + markdown/HTML/image + pins + doc-link nav). Alternative: a lighter
   **browse + view only** subset (drop pins/polling/doc-links) for a small card.
3. **Pins/poll in the dock** — keep the 5s live poll and per-project pins in the
   dock instance, or make them tab-only to keep the dock cheap?

## Out of scope

- File **editing** — this is browse + view only.
- Backend changes — the existing `FileController` already serves any repo via
  `X-Repo-Id`.
