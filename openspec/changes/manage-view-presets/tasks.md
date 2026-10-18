# Tasks — manage-view-presets

- [x] Investigate the split view (ManageApp: layout / tab / paneOrder / hidden / paneWeights in localStorage).
- [x] Pure preset model (`viewPresets.js`): capture, auto name, apply plan, modified, merge, shortcuts (+ node tests).
- [x] Preset bar: Save view (Alt+Shift+S), preset tabs (🔖, Alt+1..9), highlight, modified → Update / Revert, ⋯ rename / update / reorder / delete.
- [x] Hub copy: `GET/PUT /api/settings/view-presets` (`ViewPresetsService`, .NET tests); browser-wins ⇅ Sync.
- [x] Robustness: a missing tab opens the rest with a toast; fractions survive a resize; the default view is untouched until a preset is applied.
- [x] Lab on this hub 25/25 (two browser profiles), GIF + screenshots, Understanding app.
- [ ] Operator: after merge + deploy, arrange 2–3 views on the hub's dashboard and save them.
