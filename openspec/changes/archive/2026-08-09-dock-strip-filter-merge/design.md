## Context

The dock strip's segmented filter lives entirely in
`client/src/components/dashboard/DockToolbar.jsx`: a view-local `filter` state
(`'all' | 'main' | 'feature' | 'running' | 'unseen'`) and a `matchesFilter(tab)`
classifier that decides which tabs render. The dot classifiers `isRunning` /
`isUnseen` are the shared single source for both the dot render and the status
filter states, and `isUnseen` already requires `dashboard === false` (a
grid-visible dock never shows the `!`). The `+N` excluded count, ephemerality,
and reorder-mode suspension all derive from `visibleTabs` vs `tabs`. There is no
server involvement: the strip reads the roster, the `live` run map, and the
per-repo `git` map that the Dashboard already polls.

## Goals / Non-Goals

**Goals:**

- One "needs attention" status state: **running** renders tabs whose dot shows
  running **or** the `!` unseen marker; the separate **unseen** state disappears.
- Grid-visible docks' tabs render under **every** filter state, so the strip is
  always a superset of what the grid shows; filters only narrow *hidden* docks.
- Keep the whole existing filter contract intact: view-only, `+N` count,
  ephemeral selection, reorder-mode suspension, unchanged click semantics.

**Non-Goals:**

- No change to the dots, the server-owned `unseenResult` latch, or when it
  clears; no change to the grid, roster order, or Agents page.
- No new server state, endpoints, or polling.
- No persistence of the filter selection (stays view-local).

## Decisions

1. **Exemption first, then per-state checks.** `matchesFilter` gains
   `if (tab.dashboard !== false) return true;` as its first non-All branch, so
   the exemption applies uniformly to branch and status states and can never
   drift per-state. Alternative — special-casing each state — rejected as
   duplicated logic that the next state addition would forget.

2. **Merge by classifier union, not a new classifier.** The `running` state
   matches `isRunning(tab) || isUnseen(tab)`, reusing the exact dot classifiers.
   Since `isUnseen` requires a hidden dock, the merged view is precisely:
   all grid-visible docks (via the exemption) + hidden running docks + hidden
   unseen docks. No new predicate to keep in sync with the dot.

3. **Drop the `unseen` button entirely** (state list and `dockFilterUnseen`
   i18n keys in `en.json`/`tr.json` removed) rather than keeping it as an alias.
   A control state that renders the same set as another state is dead weight and
   would need its own spec scenario forever.

4. **Label stays "running"; the button's title/tooltip conveys the merge**
   (e.g. "running or unseen result") by rewording the `dockFilterRunning`
   string's usage — the visible segmented label keeps its short form, matching
   the user's mental model ("click running, see both").

5. **`+N` count semantics unchanged by construction**: it still counts
   `tabs.length - visibleTabs.length`; with the exemption, the excluded set can
   only ever contain hidden docks' tabs — no code change needed beyond
   `matchesFilter`.

6. **Update the DockToolbar header comment** — the file's convention is a
   header narrating each openspec amendment; add this change's paragraph and
   correct the now-wrong "unseen state" sentences.

## Risks / Trade-offs

- [Operators lose an "only unseen" view] → Inside the merged view, unseen tabs
  remain visually distinct (`!` dot vs near-black running dot), and the unseen
  population is typically small; triage still works in one view.
- [Branch filters no longer hide visible docks — "not on main" shows a visible
  main-branch dock] → Intended: the strip is now guaranteed to be a superset of
  the grid. The `+N` count keeps reporting what the filter did exclude.
- [Stale header comment / spec drift] → The delta spec rewrites both affected
  requirements in full, and the header comment is updated in the same task.
