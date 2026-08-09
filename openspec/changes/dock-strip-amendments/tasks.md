## 1. Queued-prompt indicator on strip tabs

- [ ] 1.1 In `DockToolbar.jsx`, derive `queued = (tab.stash?.length || 0) > 0` per tab (same field the grid cell's `dash-cell--queued` border reads)
- [ ] 1.2 Add a `dash__docktab-dot--queued` modifier rendering a near-black ring (with a 1px light halo gap) around the dot, composing with the at-rest color, `--running`, and `--unseen` states in `dashboard.css`
- [ ] 1.3 Add the queued fragment to the tab's composed aria-label/title (new i18n key `dashboard.dockToolbarQueued` in `en.json` + `tr.json`)
- [ ] 1.4 Verify the roster tabs passed to the toolbar carry `stash` for hidden docks too (DockContext syncs the full roster); if a mapping strips it, thread the field through

## 2. Bulk show/hide controls

- [ ] 2.1 Add show-all / hide-all buttons beside the ⇄ reorder toggle in `DockToolbar.jsx`, with i18n aria-labels/titles (`dashboard.dockShowAll`, `dashboard.dockHideAll` in `en.json` + `tr.json`)
- [ ] 2.2 Disable each button when it is a no-op (all docks already shown / already hidden) and while reorder mode is active
- [ ] 2.3 Add an `onToggleAll(visible)` prop; in `Dashboard.jsx` implement it by iterating the existing per-dock visibility update path over docks whose `dashboard` state differs from the target
- [ ] 2.4 Style the buttons in `dashboard.css` to match the reorder toggle's visual weight

## 3. Verify

- [ ] 3.1 `npm --prefix client run build` passes
- [ ] 3.2 Browser-verify per `docs/claude-web/browser-testing.md`: queued ring appears on a hidden dock's tab when a prompt is stashed and disappears when the stash empties; ring composes with running (black pulsing) and unseen (!) states
- [ ] 3.3 Browser-verify bulk controls: hide-all empties the grid recoverably (empty-state hint, strip intact), show-all restores every tile, Agents-page toggles agree, both disabled at their no-op extreme and in reorder mode
- [ ] 3.4 `openspec validate dock-strip-amendments --strict` passes
