## 1. Header layout (Dashboard.jsx)

- [x] 1.1 Remove the `<h2 className="dash__title">` from the dashboard header
      (keep the `dashboard.title` i18n key — still used by aria-labels and the
      free-drag agents panel head)
- [x] 1.2 Reorder the header children: `DockToolbar` first (leading), then the
      size/zoom/layout/view/only-important groups, close button last

## 2. CSS (dashboard.css)

- [x] 2.1 `.dash__docktoolbar`: `flex: 1 1 0` (drop the `1 1 100%` own-row
      sizing; basis 0 — an auto basis makes flex-wrap line-break on the full
      roster width and wraps the controls), `margin-top: 0`, add a ~40%
      min-width floor so the toolbar never collapses; keep `overflow-x: auto`
- [x] 2.2 Trim the spacing budget: `.dash` padding `16px` → `8px 12px`,
      `.dash__header` `margin-bottom: 12px` → `6px`; delete the stale
      "own row" comment and update it to describe the shared bar + narrow-wrap
      behavior
- [x] 2.3 Remove/adjust `.dash__title` rules now that the node is gone

## 3. Verify

- [x] 3.1 Build `client/dist`; run the harness on an isolated preview port with
      a seeded dock roster (Debug build on :5214, fresh `CLAUDEWEB_DATADIR`,
      12 seeded dock tabs — `verify-slim-chrome.mjs`)
- [x] 3.2 Playwright (desktop viewport): no "Dashboard" heading; toolbar and all
      controls on ONE row (same bounding-line y-range); toolbar scrolls with a
      large roster; size/zoom/view/only-important/close still function;
      screenshot (`out-slim-chrome-desktop.png`)
- [x] 3.3 Playwright (narrow/phone viewport): controls wrap below the docks bar
      and stay usable; first dock tile's top edge measurably higher than on the
      pre-change build (y=1057 vs 1097 baseline, −40px); screenshot
      (`out-slim-chrome-phone.png`)
- [x] 3.4 `openspec validate dashboard-slim-chrome --strict`
