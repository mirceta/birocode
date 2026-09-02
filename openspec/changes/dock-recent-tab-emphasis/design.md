# Design: dock-recent-tab-emphasis

## Context

`DockToolbar.jsx` owns a view-local `filter` state (`'all' | 'main' | 'feature' |
'running'`) with a `matchesFilter(tab)` predicate, exemptions for grid-visible and
important docks, a +N excluded chip, and reorder-mode suspension. It classifies each
tab's dot with two shared helpers, `isRunning(tab)` (from the dashboard's `/api/runs`
poll via the `live` map, falling back to `tab.status`) and `isUnseen(tab)` (hidden ∧
not running ∧ server `unseenResult`).

The dashboard computes a per-dock "last user message" time (`lastUserAt`) **only for
grid-visible docks**, by fetching each visible dock's transcript on the 5 s poll — and
`recencyTier` caps at 1 h. Hidden docks get `at = 0`. openspec
`reduce-connection-appetite` explicitly keeps it that way (browser 6-connection
budget), so a "recent" filter cannot be built on the client's transcript fetches
without either missing hidden docks (the whole point of the strip) or fetching every
roster transcript every 5 s.

On the server, `DockRegistry` persists `DockTab` (with the server-owned `UnseenResult`
latch), and `RunSessionService.TryBeginRun(repoId, lane)` is the single point every
prompt path passes through; `RunCompleted` already bridges run end to the
`DockUnseenResultTrigger` hosted service.

## Decisions

- **Record "last prompt" on the server, at run start, per dock tab.** Add
  `long? LastPromptAt` (Unix ms) to `DockTab`, stamped for every tab of the repo when a
  **builder**-lane run begins. Mirrors the `UnseenResult` precedent: server-owned,
  persisted with the roster, read-only for clients, exposed as `lastPromptAt` in the
  dock DTO. This covers hidden docks, survives reloads/restarts, and costs zero extra
  requests — the roster is already loaded and refreshed by the dashboard.
  - *Alternative rejected:* add `startedAt` to the `/api/runs` snapshot. In-memory
    only, so every redeploy wipes all recency and the operator sees an empty
    **recent** view after each deploy.
  - *Alternative rejected:* fetch transcripts for the full roster. Contradicts
    `reduce-connection-appetite`.
- **`RunStarted` event on `RunSessionService`**, the mirror image of `RunCompleted`
  (`RunStartedEvent(RepoId, Lane, SessionId?)`), raised from `TryBeginRun` after the
  slot is claimed. Same invocation contract: each subscriber invoked independently,
  exceptions caught and logged, never fails the send path. `DockUnseenResultTrigger`
  subscribes to it as well and calls `DockRegistry.MarkPromptedForRepo(repoId, nowMs)`
  (the trigger may be renamed to reflect its two duties, or a sibling trigger added —
  implementer's call; the dependency direction stays dock → chat per
  `plans/INTEGRATION.md`).
- **Builder lane only.** Ask-lane side conversations are read-only and never drive the
  busy dot; "the agent was sent a prompt" means the builder. Autopilot/loop-driven
  prompts count — they go through `TryBeginRun` like everything else — which is the
  right answer to "used in the last 5 hours".
- **`recent` is a fifth exclusive state of the same control**, not a second filter
  dimension, for the same reason `running` was: one flat segmented control, and all
  filter plumbing (exemptions, chip, ephemerality, reorder suspension) keys off
  `filter !== 'all'` and `visibleTabs`. Predicate:
  `!!tab.lastPromptAt && now - tab.lastPromptAt < RECENT_MS` with
  `RECENT_MS = 5 * 60 * 60 * 1000`; a tab with no `lastPromptAt` never matches (only
  **All** shows it). `now` is `Date.now()` at render; the strip re-renders on every
  5 s `setLive`, so tabs age out of the window without a timer.
- **Emphasis is a size-only modifier class, driven by the dot helpers.** In the tab
  render, `emphasized = running || unseen` adds `dash__docktab--emphasized`. CSS scales
  the pill ~1.5×: font 12→18 px, branch row 10→15 px, dot 8→12 px (unseen badge
  14→21 px, glyph 10→15 px), padding 3/10→5/15 px, gap 6→9 px, star 12→18 px,
  max-width 180→270 px. Applied in every filter state — the point is to make attention
  tabs obvious wherever they appear. `align-items: center` on the strip keeps
  mixed-height tabs on one row; the strip already overflow-scrolls, so the extra
  width costs nothing. No layout change to the grid.
- **Recency filter and emphasis are independent.** A recent-but-idle tab renders
  normal size under **recent**; a running tab renders emphasized under **All**.

## Risks / Trade-offs

- **Persisting a timestamp per prompt adds one roster `Save()` per run start.** Same
  cadence as the unseen latch on run end; the roster file is small. Acceptable.
- **Existing tabs have no `lastPromptAt` until their next prompt**, so the **recent**
  view starts empty (or nearly) right after deploy. Expected and self-healing; the
  proposal does not backfill from transcripts.
- **Emphasized tabs make the strip taller** while any agent runs. The strip's
  `align-items: center` already tolerates two-row (branch) tabs; the header row will
  grow by roughly 10 px when emphasis is present. If that proves jarring, a follow-up
  could reserve the emphasized height always — out of scope here.
- Six segments widen the filter control; one short word each, and the strip scrolls.
