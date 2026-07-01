## 1. Frontend — dock toolbar

- [x] 1.1 In `Dashboard.jsx`, derive the full (unfiltered) dock roster from `useDock()` `tabs`, ordered the same way the grid orders them; keep the grid's existing `dashboard !== false` filter as-is
- [x] 1.2 Render a `DockToolbar` strip inside `.dash__header` (own row), one tab per dock: color dot + short label, `role="tablist"` / `aria-pressed` per tab reflecting active (`dashboard !== false`) vs inactive
- [x] 1.3 Wire tab click → `updateTab(id, { dashboard: !(tab.dashboard !== false) })`; confirm the grid tile appears/disappears from the change to the `tabs` memo (no local duplicate state)
- [x] 1.4 Add an empty-state hint in the grid when every dock is hidden (all tabs inactive), pointing at the toolbar to re-show one

## 2. Styling & i18n

- [x] 2.1 `dashboard.css`: toolbar row styles — horizontal overflow-x scroll for large rosters, compact active/inactive tab states, color dot
- [x] 2.2 i18n keys for the toolbar label and per-tab accessible show/hide state (`dashboard.dockToolbar*`), added to every locale file

## 3. Gate

- [x] 3.1 Ensure the toolbar is behind the same Advanced gate as the dashboard / agent dock; add a `UiModeContext.jsx` capability-map entry (Advanced) if treated as a distinct feature, else confirm it inherits the dashboard's gate — INHERITS: the Dashboard overlay only renders under `useFeature('agentDashboard')` (Advanced) in `Layout.jsx`; the toolbar lives inside `Dashboard.jsx`, so Basic mode shows neither. No new capability entry.

## 4. Verify & document

- [x] 4.1 `openspec validate add-dashboard-dock-toolbar --strict` passes
- [x] 4.2 Build (client) clean; browser-verify on an isolated preview port with Playwright: toggle a dock off from the toolbar → its tile leaves the grid and the tab goes inactive; toggle it back on → tile returns; hide all → empty-state hint shows; screenshot — `verify-dock-toolbar.mjs` on :5210, 16/16 PASS, screenshots in `out-dock-toolbar/`
- [x] 4.3 Confirm consistency with the Agents-page `▦` toggle (toggling in the toolbar is reflected there and vice-versa) — verified: after toolbar toggles, the Agents page shows all 3 cards `agent-card__dash--off` (both surfaces drive the same `dashboard` field via `updateTab` → `PATCH /api/dock/{id}`)
- [x] 4.4 Update the repo-root `understanding-app/index.html` to explain the dock toolbar → `dashboard` field → grid filter flow — rolling-latest overwritten with an interactive simulator (toolbar → filter → grid, plus the Agents-page mirror and the shared-vs-personal decision)
