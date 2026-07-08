## 1. ProductFrame zoom mechanism

- [x] 1.1 Add zoom constants (`ZOOM_MIN 0.5`, `ZOOM_MAX 2`, `ZOOM_STEP 0.25`) and a `zoomable` prop with component-local zoom state to `client/src/components/app/ProductFrame.jsx`; clamp at the bounds
- [x] 1.2 Wrap the iframe in a `.product-frame__viewport` and apply `transform: scale(f)` / `transform-origin: top left` with compensated `calc(100% / f)` width/height on the iframe (no-op markup/styling when not `zoomable` or at 100%)
- [x] 1.3 Style the viewport in `client/src/components/app/product.css`: `overflow: hidden` (compensated scale fills the viewport exactly — see design.md), frame footprint fixed regardless of zoom, magnified content scrolls via the app's own scrollbars

## 2. Zoom controls overlay

- [x] 2.1 Render the corner-anchored control cluster (zoom-out, level indicator shown only when ≠100%, zoom-in, reset) inside the viewport when `zoomable` and the frame is online; disable −/+ at the clamps; accessible labels on all buttons (the level pill doubles as the reset affordance)
- [x] 2.2 Add i18n strings for the controls to `client/src/i18n/en.json` and `client/src/i18n/tr.json`
- [x] 2.3 Keep the overlay pointer-safe: buttons interactive, the rest of the overlay `pointer-events: none` so iframe interaction and scrolling are unaffected

## 3. Wire up the two surfaces

- [x] 3.1 Pass `zoomable` from the dock's local-apps view (`client/src/components/dashboard/PinnedAgent.jsx` ProductFrame usage)
- [x] 3.2 Pass `zoomable` from the Local tab (`client/src/pages/LocalApp.jsx` ProductFrame usage), available in Basic and Advanced modes
- [x] 3.3 Confirm App tab preview (`AppRun.jsx`) and Landing (`Landing.jsx`) render without the control and without markup/style regressions (no `zoomable` prop → early return of the bare iframe, markup identical to before)

## 4. Verify against the spec

- [x] 4.1 Build the client and verify in a headless browser (per `docs/claude-web/browser-testing.md`): zoom in/out/reset on the Local tab and in a dock, clamps at 50%/200%, indicator visibility, harness chrome unaffected — 23/23 Playwright checks passed (`.preview-test/zoom-test.mjs` against an isolated harness instance on :5300 with its own datadir; live untouched)
- [x] 4.2 Verify zoomed-in content scrolls within the frame (inner viewport 499px → 250px at 200%, scrollWidth > innerWidth) and the frame's footprint doesn't change; verified composition with the dashboard's whole-dock content-zoom slider (150% frame × 80% dock)
- [x] 4.3 Verify per-surface independence (dock A at 150%, dock B stayed 100%) and reset-to-100% on reload
- [x] 4.4 Update the understanding app (`understanding-app/`) to explain the zoom feature and how it composes with the dock-wide content zoom (status → implemented+verified; mechanism section refined to the inner-viewport story)
