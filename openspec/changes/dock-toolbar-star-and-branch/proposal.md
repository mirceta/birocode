# Proposal: dock-toolbar-star-and-branch

## Why

The dashboard's dock toolbar (the horizontal "Docks" strip that toggles each
agent dock in/out of the grid) shows only a color dot and the repo name per
tab. The operator cannot tell from the strip which agents they have flagged
as **important** (the star in the dock panel's top bar), nor which **git
branch** each agent's repo is on — both require the dock to be visible in the
grid. Since the strip is the one surface that always lists the FULL roster
(including hidden docks), it is exactly where this at-a-glance state belongs.

## What Changes

- Each toolbar tab shows a **star on its right side** when that dock's
  existing `important` flag is set — the same server-persisted flag the dock
  panel's ★ toggle and the grid cell's star already use. Toggling importance
  anywhere is reflected in the strip; the strip itself does not toggle it
  (clicking a tab keeps its one job: hide/show the dock).
- Each toolbar tab gains a **second row showing the git branch** of the
  dock's repo, beneath the existing name row, reusing the branch the
  dashboard already fetches per repo (`/git/status` → `gitInfo[repoId]`).
  When no branch is known (fetch pending, repo unreadable, branch
  `unknown`), the tab renders without the branch row rather than showing a
  placeholder.
- Accessible labels (`title` / `aria-label`) on a tab include the important
  state and branch so the added meaning is not color/glyph-only.

Known scope boundary: branch data is **per-repo**, not per-agent — two docks
opened on the same repo show the identical branch (that is what the backend
exposes today; the dock panel's own git block has the same behavior).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-dock`: the "Dashboard dock toolbar lists every dock as a toggleable
  tab" area gains two requirements — an important-star indicator on tabs and
  a branch row on tabs.

## Impact

- Frontend only; no backend or persistence changes:
  - `client/src/components/dashboard/DockToolbar.jsx` — render star + branch
    row; accept a branch lookup prop.
  - `client/src/pages/Dashboard.jsx` — pass `gitInfo` (already fetched per
    `repoId`) into `DockToolbar`.
  - `client/src/pages/dashboard.css` — tab layout grows a second row; star
    styling consistent with the existing `.important-star` language.
  - `client/src/i18n/en.json` / `tr.json` — extend tab accessible-label
    strings if needed.
- UI modes: the dashboard (and therefore the strip) is already
  Advanced-gated; no new capability-map entry needed.
