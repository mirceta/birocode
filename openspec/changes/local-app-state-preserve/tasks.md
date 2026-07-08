# Tasks: local-app-state-preserve

## 1. Frame host infrastructure

- [x] 1.1 Create `LocalAppFramesContext` (client/src/context/) — frame registry state: `frameKey → { url, port, zoom, reloadKey, lastVisibleAt }`, with `acquireFrame`, `releaseSlot`, `releaseFrames(predicate)`, `refreshFrame`, `setZoom` actions
- [x] 1.2 Create `LocalAppFrameHost` component — fixed full-viewport `pointer-events:none` container mounted once in `Layout.jsx` outside the router `Outlet`, rendering one wrapper per registered frame
- [x] 1.3 Implement slot projection — position each visible frame wrapper over its registered slot rect via `ResizeObserver` + capture-phase scroll/resize listeners with rAF batching; `display:none` for frames with no registered slot
- [x] 1.4 Implement lifetime rules — LRU cap of 6 (evict least-recently-visible), release on Local-tab repo change (`local:<oldRepo>:*`), dock removal (`dock:<dockId>:*`), and app removed from `localApps`; verify plain page reload starts clean

## 2. ProductFrame split

- [x] 2.1 Extract the iframe + zoom viewport from `ProductFrame.jsx` into a host-rendered `HostedFrame`; hoist zoom level and `reloadKey` into per-frame host state so they survive navigation
- [x] 2.2 Keep `ProductFrame` as the surface shell: liveness probe, offline/empty states, and the slot `<div>` — registering the slot only while `online` and unregistering on unmount
- [x] 2.3 Add the refresh button (↻) to the frame's corner control cluster beside the zoom pill; wire it to `refreshFrame` (bumps that frame's iframe `key` only); style in `product.css` to match the zoom pill

## 3. Surface integration

- [x] 3.1 Local tab (`LocalApp.jsx`): frame keys `local:<repoId>:<appId>`; app switching swaps the registered slot key instead of reassigning `src`; toolbar refresh delegates to `refreshFrame` for the visible frame
- [x] 3.2 Agent dock (`PinnedAgent.jsx`): frame keys `dock:<dockId>:<repoId>:<appId>`; app-view close / dock-view switch unregisters the slot (frame kept); reopening re-registers it
- [x] 3.3 Multi-pane (`PaneStrip`): confirm pane eviction only unregisters slots (no release) and frames re-project when the pane scrolls back in — no code change needed: pane eviction unmounts the shell, which is the same releaseSlot-only path Playwright verified via studio-tab switches
- [x] 3.4 Z-index: place the host container below the app's modal/menu layer and verify modals draw over embedded frames — host at z-index 4, below every overlay layer in the app (dashboard chrome 5-21, menus 20-50, modals 1000+); verified computed style in Playwright

## 4. Verification

- [x] 4.1 Build the frontend and run the harness on the isolated preview (per `docs/claude-web/self-dev.md`)
- [x] 4.2 Playwright checks (per `docs/claude-web/browser-testing.md`): type into an embedded app, switch studio tab away/back → state intact; dock app → Console → app → state intact; app A ↔ app B on one surface → both keep state
- [x] 4.3 Playwright checks: per-frame refresh reloads only that frame; zoom level survives navigation; repo switch releases frames; page reload starts clean
- [x] 4.4 Update the Understanding app (`understanding-app/`) to explain the frame-host architecture, then hand off to the user for acceptance testing on preview — no merge to main or deploy until they approve
