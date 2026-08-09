## 1. Branch filter on the strip

- [x] 1.1 In `DockToolbar.jsx`, add view-local filter state (`'all' | 'main' | 'feature'`, default `'all'`) alongside the reorder-mode state
- [x] 1.2 Derive each tab's classification from the existing `git` map: normalize `'unknown'` â†’ no branch, `mainlike = branch === 'main' || branch === 'master'`; filter the rendered tabs (`'main'` â†’ mainlike only, `'feature'` â†’ known non-mainlike only, `'all'` â†’ everything)
- [x] 1.3 Render a three-button segmented control next to the â‡„ toggle (`All` / `âŽ‡ main` / `âŽ‡ â‰ main`) with `aria-pressed` on the active segment and i18n labels (`dashboard.dockFilterAll`, `dashboard.dockFilterMain`, `dashboard.dockFilterFeature` in `en.json` + `tr.json`)
- [x] 1.4 Render the `+N` hidden-tab count chip when a non-All state excludes tabs (i18n `dashboard.dockFilterHidden`), also folded into the filter group's accessible label; no chip when nothing is excluded
- [x] 1.5 Suspend the filter in reorder mode: full roster renders, segmented control disabled, selection retained and reapplied on exit
- [x] 1.6 Style the segmented control + count chip in `dashboard.css` to match the reorder toggle's visual weight

## 2. Verify

- [x] 2.1 `npm --prefix client run build` passes
- [x] 2.2 Browser-verify per `docs/claude-web/browser-testing.md`: with repos on `main` and on a feature branch, each filter state renders exactly the matching tabs; unknown-branch tab shows only in All; `+N` chip counts the excluded tabs; grid tiles and Agents-page visibility toggles never change while switching states
- [x] 2.3 Browser-verify ephemerality + reorder: reload resets to All; entering â‡„ shows the full roster with the filter control disabled, exiting reapplies the prior state
- [x] 2.4 `openspec validate dock-strip-amendments --strict` passes
