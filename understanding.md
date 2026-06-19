# Understanding — Render Files-tab functionality in the agent dock

## What you asked for

Bring the **Files tab**'s functionality **into the agent docks themselves** — the
per-agent "phones" on the dashboard — so each dock can browse and view *its own*
repo's files, right where you watch that agent. **Not** a separate Files panel
sitting beside Ideas/Autopilot (my first attempt — corrected).

## How it works

- Each agent dock (`PinnedAgent`) already swaps its screen between the chat
  (Builder/Ask lanes) and its local apps. **Files is a third screen**: a **📁
  Files** tab added to the dock's `phone__lanes` row, beside Builder/Ask.
- Picking it shows the **shared `FilesBrowser`** scoped to **that agent's repo**
  (`tab.repoId`). Picking a chat lane or a local app swaps back. The three
  screens (chat / local app / files) are mutually exclusive.
- **Full parity** with the routed Files tab via the shared `FilesBrowser`
  extracted from `Files.jsx` (tree + viewer + markdown/HTML/image + pins + 5s
  live poll + doc-link nav) — so the dock and the tab can't drift.

## Changes made

1. `components/files/FilesBrowser.jsx` — shared engine; `repoId` prop scopes
   every API call (empty `repoId` → quiet empty state).
2. `pages/Files.jsx` — thin wrapper: `<FilesBrowser repoId={currentRepoId}/>`.
3. `components/dashboard/PinnedAgent.jsx` — **📁 Files** tab in the lanes row;
   `showFiles` swaps `phone__screen` to `<FilesBrowser repoId={tab.repoId}/>`.
   Gated on the `filesDock` feature.
4. `context/UiModeContext.jsx` — `filesDock: 'advanced'` flag.
5. `i18n/en.json` + `tr.json` — `files.noRepo` empty state + `files.tab` /
   `files.tabHint` for the in-dock tab.
6. **Removed** the rejected standalone dock: `FilesPanel.jsx`, `files-panel.css`,
   the `dash__files` styles, and its wiring in `Dashboard.jsx`.

## Out of scope

- File editing (browse + view only). No backend changes — `FileController`
  already serves any repo via `X-Repo-Id`.

## Status

Rebuilt to the corrected design; frontend compiles cleanly. Next: browser-verify
in the self-dev build.
