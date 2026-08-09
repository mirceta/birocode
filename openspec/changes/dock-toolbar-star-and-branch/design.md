# Design: dock-toolbar-star-and-branch

## Context

The dock toolbar is `client/src/components/dashboard/DockToolbar.jsx`, mounted
once from `Dashboard.jsx` (`<DockToolbar tabs={rosterTabs} live={live}
onToggle={toggleDashboard} />`). Each tab renders a color dot plus
`tab.repoName` and toggles the dock's `dashboard` visibility field.

Two existing data sources cover everything this change needs:

- **Important flag**: `tab.important` is already on every roster tab — it is
  the server-persisted `Important` field on `DockTab` (stored in `dock.json`,
  emitted by `GET /api/dock`, toggled via the dock panel's / grid cell's
  `ImportantStar`). The toolbar receives it today and ignores it.
- **Branch**: `Dashboard.jsx` already fetches `/git/status` once per unique
  `tab.repoId` into `gitInfo` state (`{ [repoId]: { branch, ... } }`) and
  feeds it to docks and grid cells. The toolbar just isn't given it.

So the whole change is frontend wiring + presentation; no backend, no new
fetches, no persistence.

## Goals / Non-Goals

**Goals:**

- Surface `important` and the repo's current branch on each toolbar tab,
  visible for hidden docks too (that's the strip's whole point).
- Keep the tab's single click action (hide/show) untouched.
- Keep the strip compact — it lives in the shared header bar the
  `dashboard-chrome` spec fights to keep small.

**Non-Goals:**

- No toggling of importance from the strip (the star is an indicator, not a
  button — nested interactive controls inside the tab `<button>` are an a11y
  trap and the dock panel / grid cell already own that action).
- No per-agent (per-session/worktree) branch tracking — branch stays
  per-repo, exactly what `/git/status` exposes; two docks on one repo show
  the same branch.
- No extra polling: reuse the `gitInfo` the dashboard already loads/refreshes.

## Decisions

1. **Pass the whole `gitInfo` map to `DockToolbar` as a `git` prop** and look
   up `git?.[tab.repoId]?.branch` per tab.
   - Alternative — precompute a `{tabId: branch}` map in `Dashboard.jsx`:
     more code for no gain; the component-level lookup matches how `live` is
     already passed and consumed.
2. **Render the star as a plain presentational glyph (★), not the
   `ImportantStar` component.** `ImportantStar` is a `role="button"` toggle
   with click handling; putting it inside the tab `<button>` would nest
   interactive semantics and invite mis-taps on a small target. A static
   `<span aria-hidden="true">★</span>` on the tab's right side, colored with
   the same gold as `.important-star--on`, keeps the visual language without
   the interaction. The important state is conveyed accessibly via the tab's
   `aria-label`/`title` instead.
3. **Branch renders as a second row under the name**, prefixed with the same
   `⎇` glyph `GitStatusSummary` uses, in a smaller muted font. The tab
   becomes a two-line button; the dot and star stay vertically centered
   against the text block. When `branch` is missing, empty, or `'unknown'`,
   the row is omitted entirely (no placeholder), so tabs without git data
   collapse back to today's single-line look.
4. **Accessible labels extend the existing i18n strings.** The tab's
   `title`/`aria-label` (currently "Show/Hide {name}…" and the unseen
   variant) gain optional ", important" and ", branch {branch}" fragments via
   new i18n keys in `en.json`/`tr.json`, composed in `DockToolbar` so glyphs
   never carry meaning alone.

## Risks / Trade-offs

- [Taller strip eats header space on the shared bar] → keep the branch row
  ~10px with tight line-height; the strip already scrolls horizontally, and
  tabs without branch data stay single-line. Net height gain is a few px on
  the one header row.
- [Branch is per-repo, operator may read it as per-agent] → accepted and
  documented in the proposal; matches the dock panel's own git block, so the
  strip never disagrees with the dock it toggles.
- [Branch staleness — `gitInfo` loads on dashboard mount / roster change, and
  a checkout from inside an agent won't reflect until the next refresh] →
  same staleness the grid cells and dock git blocks already have; no new
  refresh machinery for the strip.
- [Star glyph could be confused with the clickable stars elsewhere] →
  indicator sits inside a button whose whole surface already does one thing;
  pressing it does what pressing the tab always did, nothing destructive.
