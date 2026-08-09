# Proposal: dock-toolbar-star-and-branch

## Why

The dashboard's dock toolbar (the horizontal "Docks" strip that toggles each
agent dock in/out of the grid) shows only a color dot and the repo name per
tab. The operator cannot tell from the strip which agents they have flagged
as **important** (the star in the dock panel's top bar), nor which **git
branch** each agent's repo is on — both require the dock to be visible in the
grid. Since the strip is the one surface that always lists the FULL roster
(including hidden docks), it is exactly where this at-a-glance state belongs.

Amendment (agent ordering): today the operator cannot choose the order agents
appear in at all — the grid auto-orders them (important docks pinned first,
the rest shuffled by recency, per the frozen `plans/important-agents.md`),
and the strip copies that order. The user wants the order to be theirs:
re-arrangeable with plain clicks in the strip, with the grid following the
strip exactly.

## What Changes

- Each toolbar tab shows a **star on its right side** when that dock's
  existing `important` flag is set — the same server-persisted flag the dock
  panel's ★ toggle and the grid cell's star already use. Toggling importance
  anywhere is reflected in the strip; the strip itself does not toggle it
  (outside reorder mode, clicking a tab keeps its one job: hide/show the
  dock).
- Each toolbar tab gains a **second row showing the git branch** of the
  dock's repo, beneath the existing name row, reusing the branch the
  dashboard already fetches per repo (`/git/status` → `gitInfo[repoId]`).
  When no branch is known (fetch pending, repo unreadable, branch
  `unknown`), the tab renders without the branch row rather than showing a
  placeholder.
- Accessible labels (`title` / `aria-label`) on a tab include the important
  state and branch so the added meaning is not color/glyph-only.
- **The roster order becomes operator-controlled, edited from the strip.**
  The strip gains a small **reorder toggle (⇄)**; while it is on, clicking a
  tab picks it up and clicking another tab drops it into that tab's position
  (tap the picked tab again to cancel; hide/show is suspended for the
  duration of the mode). The resulting order is **persisted server-side as
  the dock list's order** (new `POST /api/dock/reorder`, mirroring the
  existing per-dock stash reorder), so it is shared across devices like
  every other dock field.
- **The dashboard grid renders agents in that same roster order.** The
  automatic ordering — important docks pinned first, the rest sorted by
  recency — is **removed**: strip order IS grid order (the grid's existing
  dependent-"together" grouping still pulls a dependent under its primary).
  The important flag keeps its star, border, and "show only important"
  filter; it just no longer moves agents around.

⚠️ Convention supersession, surfaced on purpose: the important-first +
recency-hotness ordering is a documented behavior from
`plans/important-agents.md` (frozen/historical plan). This change replaces
it with explicit operator ordering — recorded here in OpenSpec, the living
system, per the migration convention.

Known scope boundary: branch data is **per-repo**, not per-agent — two docks
opened on the same repo show the identical branch (that is what the backend
exposes today; the dock panel's own git block has the same behavior).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-dock`: the "Dashboard dock toolbar lists every dock as a toggleable
  tab" area gains four requirements — an important-star indicator on tabs, a
  branch row on tabs, an operator-controlled roster order shared by strip
  and grid, and a click-based reorder mode in the strip.

## Impact

- Backend (roster order persistence):
  - `ClaudeWeb.App/Services/Dock/DockRegistry.cs` — `Reorder(orderedIds)`,
    mirroring `ReorderStash`: listed ids take the given order, unknown ids
    are ignored, unlisted tabs keep their relative order at the end (so a
    tab added by another device mid-reorder is never dropped); persists via
    the existing `Save()`.
  - `ClaudeWeb.App/Controllers/DockController.cs` — `POST /api/dock/reorder`
    taking the full id order, like the stash reorder route.
- Frontend:
  - `client/src/context/DockContext.jsx` — `reorderTabs(orderedIds)`:
    optimistic local reorder + POST, reusing the existing pending-mutation
    guard so a poll reconcile can't clobber the optimistic order.
  - `client/src/components/dashboard/DockToolbar.jsx` — render star + branch
    row; reorder-mode toggle + pick-and-place tab clicks.
  - `client/src/pages/Dashboard.jsx` — pass `gitInfo` into `DockToolbar`;
    drop the important-first/recency sorts from `orderedTabs`/`rosterTabs`
    (both become plain roster order); wire `reorderTabs`.
  - `client/src/pages/dashboard.css` — tab layout grows a second row; star
    styling consistent with the existing `.important-star` language;
    reorder-mode affordances (toggle button, picked-tab highlight).
  - `client/src/i18n/en.json` / `tr.json` — extend tab accessible-label
    strings; new reorder-mode labels.
- Behavior removal: the grid no longer auto-orders (important-first pinning
  and recency shuffling are gone — see the supersession note above).
- UI modes: the dashboard (and therefore the strip) is already
  Advanced-gated; no new capability-map entry needed.
