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

So the star + branch part is frontend wiring + presentation.

**Ordering (amendment):** today `Dashboard.jsx` computes `orderedTabs` (grid)
and `rosterTabs` (strip) with the same rule — important docks pinned first in
stable dock order, the rest sorted by recency (`live[id].at`), per the frozen
`plans/important-agents.md`. The underlying roster (`dock.json`'s `_tabs`
list, served by `GET /api/dock` in creation order) is already an ordered,
server-persisted, cross-device list — it just has no reorder operation and
its order is currently masked by those sorts. The per-dock stash already has
the exact pattern we need: `POST /dock/{id}/stash/reorder` takes the full id
order, `DockRegistry.ReorderStash` applies it, and `DockContext` does an
optimistic local reorder behind a pending-mutation guard so the poll can't
clobber it.

## Goals / Non-Goals

**Goals:**

- Surface `important` and the repo's current branch on each toolbar tab,
  visible for hidden docks too (that's the strip's whole point).
- Keep the tab's single click action (hide/show) untouched **outside reorder
  mode**.
- Keep the strip compact — it lives in the shared header bar the
  `dashboard-chrome` spec fights to keep small.
- Let the operator reorder agents with plain clicks in the strip, on a phone,
  and make that order the one order both the strip and the grid render in —
  persisted and shared across devices like every other dock field.

**Non-Goals:**

- No toggling of importance from the strip (the star is an indicator, not a
  button — nested interactive controls inside the tab `<button>` are an a11y
  trap and the dock panel / grid cell already own that action).
- No per-agent (per-session/worktree) branch tracking — branch stays
  per-repo, exactly what `/git/status` exposes; two docks on one repo show
  the same branch.
- No extra polling: reuse the `gitInfo` the dashboard already loads/refreshes.
- No drag-and-drop for reordering — touch DnD is unreliable without a
  library and the End User is on a phone; reordering is discrete taps.
- No per-device order — one shared order, like `important`/`color`/
  `dashboard`. Device-local order would make "my phone disagrees with the
  desk PC" a support puzzle.
- No automatic ordering anymore — this change deliberately removes the
  important-first pinning and recency shuffle rather than layering manual
  order on top of them (two owners of one order can only fight).

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
5. **The roster's array order becomes THE display order.** `orderedTabs` and
   `rosterTabs` in `Dashboard.jsx` stop sorting: the strip renders the full
   roster in `dock.json` order, the grid renders the visible subset in the
   same relative order (the existing dependent-"together" grouping still
   applies on the grid — a dependent renders under its primary, which is why
   the requirement says the grid follows the strip's *relative* order rather
   than its exact flat sequence). `important` keeps its star, red border and
   the "show only important" filter; recency keeps its border tier — neither
   moves agents anymore. New docks append at the end (creation order),
   unchanged.
   - Alternative — keep auto-ordering and store a manual override list
     beside it: two sources of truth that fight each other; rejected.
6. **Reorder is a strip-level mode with pick-and-place taps.** A small ⇄
   toggle button at the strip's start (after the label) enters reorder mode:
   the first tap on a tab "picks it up" (highlight), a tap on another tab
   moves the picked tab to that tab's position — landing before it when
   moving left, after it when moving right, so both the very front and the
   very back are reachable; tapping the picked tab again cancels the pick.
   While the mode is on, tab clicks do NOT hide/show (the mode owns the
   click); toggling the mode off restores normal behavior. This keeps the
   rest-state strip exactly as compact and single-purpose as today.
   - Alternative — per-tab ◀/▶ nudge buttons: always-visible clutter on a
     deliberately compact strip, and O(n) taps to move across the roster;
     rejected.
   - Alternative — drag-and-drop: see Non-Goals.
7. **Persistence mirrors the stash reorder end to end.**
   `DockRegistry.Reorder(orderedIds)` (like `ReorderStash`): listed ids take
   the given order; unknown ids are ignored; tabs missing from the list keep
   their relative order, appended at the end — so a tab added from another
   device mid-reorder survives. Exposed as `POST /api/dock/reorder`
   (`{ ids: [...] }`), called from a new `DockContext.reorderTabs(orderedIds)`
   that reorders local state optimistically inside the existing
   pending-mutation guard (`trackStash`-style) so the 5s reconcile can't
   snap the strip back before the POST lands. Last-write-wins between
   devices, same as every other dock field.

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
- [Losing the recency auto-sort means a busy roster no longer self-organizes]
  → accepted; that churn is exactly what the user is opting out of. The
  operator curates once and the order stays put; recency remains visible as
  the existing border tier.
- [Superseding `plans/important-agents.md` ordering] → that plan is
  frozen/historical; the supersession is recorded in the proposal (and
  surfaced to the user) rather than silently drifting from a written
  convention.
- [Operator taps a tab in reorder mode expecting hide/show] → the mode is
  explicit (pressed ⇄ button, picked-tab highlight, tabs signal the mode),
  nothing destructive can happen, and switching the mode off restores the
  familiar click. Mode state is view-local and resets on unmount.
- [Two devices reorder at once] → full-order POST is last-write-wins, same
  contract as the stash reorder; the 5s poll converges both.
- [`orderedTabs` consumers assume important-first] → the dependent-grouping
  builder and the "only important" filter iterate whatever order they're
  given; verify in implementation that nothing else keys off position.
