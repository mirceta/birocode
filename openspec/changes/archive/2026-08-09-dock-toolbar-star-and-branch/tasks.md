# Tasks: dock-toolbar-star-and-branch

## 1. Wiring

- [x] 1.1 `Dashboard.jsx`: pass the existing `gitInfo` state into the toolbar — `<DockToolbar ... git={gitInfo} />`

## 2. DockToolbar rendering

- [x] 2.1 `DockToolbar.jsx`: accept the `git` prop; per tab derive `branch = git?.[tab.repoId]?.branch`, treating `''`/`'unknown'` as absent
- [x] 2.2 Render the text block as two rows: existing `.dash__docktab-name` on top, new `.dash__docktab-branch` row (`⎇ {branch}`) beneath, omitted entirely when branch is absent
- [x] 2.3 Render a display-only gold star (`★`, `aria-hidden`) on the tab's right side when `tab.important` is truthy; no click handling — the tab's onClick stays the hide/show toggle
- [x] 2.4 Compose the tab `title`/`aria-label` to append the important state and branch (new i18n fragments), keeping the existing show/hide/unseen base strings
- [x] 2.5 Update the component's header comment to name the two new indicators and their openspec change id

## 3. Styles

- [x] 3.1 `dashboard.css`: two-row tab layout — name+branch stacked, dot and star vertically centered against the text block; single-line tabs (no branch) keep today's height
- [x] 3.2 `.dash__docktab-branch`: small (~10px), muted, tight line-height, ellipsis on overflow so long branch names don't stretch tabs
- [x] 3.3 Star styling: same gold as `.important-star--on`, sized to the tab; verify it reads on both active (`--on`) and inactive tab backgrounds

## 4. Backend — roster order persistence (reorder amendment)

- [x] 4.1 `DockRegistry.cs`: `Reorder(IReadOnlyList<string> orderedIds)` mirroring `ReorderStash` — listed ids take the given order, unknown ids ignored, unlisted tabs keep their relative order appended at the end; `Save()` under the lock; returns the reordered copies (or null/no-op on empty input)
- [x] 4.2 `DockController.cs`: `POST /api/dock/reorder` with a `ReorderRequest(List<string>? Ids)` record, like the stash reorder route; returns the reordered roster
- [x] 4.3 XML-doc both with the semantics above and the openspec change id

## 5. DockContext — optimistic reorder

- [x] 5.1 `DockContext.jsx`: `reorderTabs(orderedIds)` — reorder local `tabs` state optimistically (listed-first + unlisted-appended, same rule as the backend), POST `/dock/reorder` wrapped in the existing pending-mutation guard (`trackStash`-style) so `refresh()` can't clobber the optimistic order; expose it from the context value

## 6. Ordering — strip order IS grid order

- [x] 6.1 `Dashboard.jsx`: drop the important-first + recency sorts — `rosterTabs` becomes the roster in list order, `orderedTabs` the grid-visible subset in the same order; update the ordering comment to name this change id and note it supersedes the `plans/important-agents.md` ordering rule (dependent-"together" grouping over `orderedTabs` unchanged)
- [x] 6.2 Verify no other consumer of `orderedTabs`/`rosterTabs` assumes important-first position (dependent grouping, "only important" filter, column math)

## 7. Reorder mode in the strip

- [x] 7.1 `DockToolbar.jsx`: accept `onReorder(orderedIds)`; add the ⇄ reorder-mode toggle button after the strip label (pressed state styled + `aria-pressed`), mode state component-local
- [x] 7.2 In reorder mode, tab clicks pick/place instead of hide/show: first tap picks (highlight class + accessible "picked" label), tap on another tab computes the new full id order — picked tab takes the target's position (before it moving front-ward, after it moving back-ward) — and calls `onReorder`; tapping the picked tab cancels; leaving the mode clears any pick
- [x] 7.3 `Dashboard.jsx`: wire `onReorder` to `reorderTabs` from `DockContext`
- [x] 7.4 `dashboard.css`: reorder toggle + picked-tab highlight styles, consistent with the strip's compact language
- [x] 7.5 Update the component header comment for the mode (clicks are mode-dependent now)

## 8. i18n

- [x] 8.1 `en.json` + `tr.json`: add the accessible-label fragments for "important" and "branch {branch}" used in 2.4
- [x] 8.2 `en.json` + `tr.json`: reorder-mode strings — toggle label, "pick up {name}", "move {name} here / drop {name}", "cancel pick"

## 9. Verify

- [x] 9.1 `npm --prefix client run build` passes
- [x] 9.2 `dotnet build` passes for the backend endpoint
- [x] 9.3 Browser check per `docs/claude-web/browser-testing.md` (isolated preview, headless Playwright): star shows on an important dock's tab (visible and hidden dock), disappears when unstarred elsewhere; branch row shows the repo branch and is absent when git status is unknown; clicking a starred tab still only hides/shows the dock
- [x] 9.4 Browser check, reorder: enter reorder mode, move a dock to the front and another to the very back via taps; strip AND grid re-render in the new order; order survives a reload (server-persisted); with the mode on, tab taps never hide/show; after exiting the mode, taps hide/show again; starring a dock no longer moves it
- [x] 9.5 `openspec validate dock-toolbar-star-and-branch --strict` passes
