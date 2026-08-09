# Design: dock-strip-status-filters

## Context

`DockToolbar.jsx` already computes, per tab, the two signals this change filters on —
`running = (live?.[tab.id]?.status || tab.status) === 'running'` and
`unseen = hidden && !running && !!tab.unseenResult` — but inside the render map, after
the branch filter has already narrowed `visibleTabs`. The branch filter itself is a
view-local `filter` state (`'all' | 'main' | 'feature'`) with a `matchesFilter(tab)`
predicate, a +N chip, and reorder-mode suspension (openspec `dock-strip-amendments`).

## Decisions

- **Same control, two more exclusive states** (`'running'`, `'unseen'`), not a second
  orthogonal filter dimension. The request is "another filter option", and one exclusive
  segmented control keeps the UI and the mental model flat; composing branch × status
  filters would multiply states for no asked-for benefit. All existing filter plumbing
  (chip, suspension, ephemerality) applies for free because it keys off `filter !== 'all'`
  and `visibleTabs`.
- **Hoist the dot's classification, don't re-derive it.** `isRunning(tab)` /
  `isUnseen(tab)` become shared helpers used by BOTH `matchesFilter` and the tab render,
  so the filter can never disagree with what the dot shows. `isUnseen` matches the
  *displayed* `!` (hidden ∧ not running ∧ latched), not the raw server flag — filtering
  on the raw flag would show tabs with no visible `!`, contradicting the user's framing
  ("if they have the exclamation mark").
- **Live re-bucketing is inherited, not built**: `live` refreshes on the dashboard's
  existing `/api/runs` poll and `unseenResult` on the roster refresh; a `setState` from
  either re-renders the strip and re-buckets. Clicking an unseen tab shows the dock →
  server clears the latch → tab leaves the `unseen` view on the next roster refresh.
  Intended triage flow; documented in the spec so it is not read as a bug.
- **Segment glyphs**: `●` for running, `!` for unseen — the same visual language as the
  dot itself; glyphs stay `aria-hidden` with the i18n text carrying the meaning. The
  group's aria-label generalizes to "Filter agents" since it now covers more than branch.

## Risks / Trade-offs

- Five segments widen the control; acceptable because the strip row already
  overflow-scrolls and the labels are one short word each.
- A `running`-filtered strip can go momentarily stale between polls (a run that just
  ended still shows until the next tick) — same staleness the dot itself has today.
