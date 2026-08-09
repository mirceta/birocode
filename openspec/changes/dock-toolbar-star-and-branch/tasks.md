# Tasks: dock-toolbar-star-and-branch

## 1. Wiring

- [ ] 1.1 `Dashboard.jsx`: pass the existing `gitInfo` state into the toolbar — `<DockToolbar ... git={gitInfo} />`

## 2. DockToolbar rendering

- [ ] 2.1 `DockToolbar.jsx`: accept the `git` prop; per tab derive `branch = git?.[tab.repoId]?.branch`, treating `''`/`'unknown'` as absent
- [ ] 2.2 Render the text block as two rows: existing `.dash__docktab-name` on top, new `.dash__docktab-branch` row (`⎇ {branch}`) beneath, omitted entirely when branch is absent
- [ ] 2.3 Render a display-only gold star (`★`, `aria-hidden`) on the tab's right side when `tab.important` is truthy; no click handling — the tab's onClick stays the hide/show toggle
- [ ] 2.4 Compose the tab `title`/`aria-label` to append the important state and branch (new i18n fragments), keeping the existing show/hide/unseen base strings
- [ ] 2.5 Update the component's header comment to name the two new indicators and their openspec change id

## 3. Styles

- [ ] 3.1 `dashboard.css`: two-row tab layout — name+branch stacked, dot and star vertically centered against the text block; single-line tabs (no branch) keep today's height
- [ ] 3.2 `.dash__docktab-branch`: small (~10px), muted, tight line-height, ellipsis on overflow so long branch names don't stretch tabs
- [ ] 3.3 Star styling: same gold as `.important-star--on`, sized to the tab; verify it reads on both active (`--on`) and inactive tab backgrounds

## 4. i18n

- [ ] 4.1 `en.json` + `tr.json`: add the accessible-label fragments for "important" and "branch {branch}" used in 2.4

## 5. Verify

- [ ] 5.1 `npm --prefix client run build` passes
- [ ] 5.2 Browser check per `docs/claude-web/browser-testing.md` (isolated preview, headless Playwright): star shows on an important dock's tab (visible and hidden dock), disappears when unstarred elsewhere; branch row shows the repo branch and is absent when git status is unknown; clicking a starred tab still only hides/shows the dock
- [ ] 5.3 `openspec validate dock-toolbar-star-and-branch --strict` passes
