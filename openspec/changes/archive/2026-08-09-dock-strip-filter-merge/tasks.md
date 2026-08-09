## 1. Strip filter logic (DockToolbar.jsx)

- [x] 1.1 Add the grid-visible exemption as the first non-All branch of `matchesFilter`: a tab with `dashboard !== false` matches every filter state
- [x] 1.2 Merge the status states: `filter === 'running'` matches `isRunning(tab) || isUnseen(tab)`; delete the `filter === 'unseen'` branch and the `'unseen'` entry from the segmented control's state list
- [x] 1.3 Update the `filter` state's inline type comment (`'all' | 'main' | 'feature' | 'running'`)
- [x] 1.4 Update the file's header comment: rewrite the status-states paragraph (running now includes unseen; no unseen state) and add a paragraph for the grid-visible exemption, tagged `openspec dock-strip-filter-merge`

## 2. i18n

- [x] 2.1 Remove the `dashboard.dockFilterUnseen` key from `client/src/i18n/en.json` and `client/src/i18n/tr.json`
- [x] 2.2 Reword `dashboard.dockFilterRunning` (en + tr) so the button's title/tooltip conveys "running or unseen result" while the visible segmented label stays short

## 3. Verify

- [x] 3.1 `npm --prefix client run build` passes
- [x] 3.2 Playwright check per `docs/claude-web/browser-testing.md`: with a mixed roster (visible dock on a feature branch, hidden running dock, hidden unseen dock, hidden idle dock) confirm — **on main** still renders the visible feature-branch dock; **running** renders the visible dock + hidden running + hidden unseen but not hidden idle; the control has no unseen button; the +N count reflects only excluded hidden docks
- [x] 3.3 Confirm clicking a hidden unseen tab under **running** shows the dock and its tab stays on the strip (now grid-visible), latch cleared
