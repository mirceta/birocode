## 1. Status states on the strip filter

- [x] 1.1 In `DockToolbar.jsx`, hoist the dot's classification into shared helpers `isRunning(tab)` / `isUnseen(tab)` (unseen = hidden ∧ not running ∧ `unseenResult`), used by both the render and the filter so they can never disagree
- [x] 1.2 Extend the view-local filter state to `'all' | 'main' | 'feature' | 'running' | 'unseen'` and `matchesFilter` to the two status states
- [x] 1.3 Add the two segments to the segmented control (`● running`, `! unseen`; glyphs aria-hidden) with i18n labels (`dashboard.dockFilterRunning`, `dashboard.dockFilterUnseen` in `en.json` + `tr.json`); generalize the group label `dashboard.dockFilter` from "by branch" to "Filter agents"
- [x] 1.4 Update the component header comment to cover the status states (classification source, live re-bucketing, unseen-clears-on-show)

## 2. Verify

- [x] 2.1 `npm --prefix client run build` passes
- [x] 2.2 Browser-verify per `docs/claude-web/browser-testing.md`: with tabs in running / unseen / plain states, the **running** state renders exactly the running tabs and **unseen** exactly the `!` tabs; a latched-but-visible (or running) dock never renders under **unseen**; +N chip counts exclusions; grid tiles and persisted `dashboard` flags never change while switching
- [x] 2.3 Browser-verify live re-bucketing: a status change delivered by the poll moves a tab in/out of the filtered strip without reload; clicking an unseen tab under **unseen** shows the dock and the tab leaves the view
- [x] 2.4 Browser-verify the inherited contract on the new states: reload resets to All; reorder mode shows the full roster with the control disabled and reapplies the selection on exit
- [x] 2.5 `openspec validate dock-strip-status-filters --strict` passes
