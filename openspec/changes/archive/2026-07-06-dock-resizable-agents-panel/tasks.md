## 1. Agents panel width state + grip

- [x] 1.1 Dashboard.jsx: `claudeweb_dash_agents_w` read/clamp helpers, width
      state, `startAgentsResize`/`moveAgentsResize`/`endAgentsResize` +
      double-click clear (mirrors the Ideas resize pattern), inline
      `width`/`maxWidth` on `.dash__main` in free mode only
- [x] 1.2 Dashboard.jsx: render the right-edge grip inside `.dash__main` (free
      mode only) + wire `resetLayout()` to clear the saved width (↺ now also
      shows when only a width is saved)
- [x] 1.3 dashboard.css: `.dash__main-resize` edge-strip styling (ew-resize,
      hover accent, touch-action none); grip label hardcoded English like the
      Ideas grip (no new i18n key needed)

## 2. Verify

- [x] 2.1 Build client + Playwright verify on isolated preview port
      (drag narrows panel + grid re-wraps, reload persists, double-click
      resets, grid mode shows no grip) + `openspec validate --strict`
      — `.claudeweb-preview/playwright/verify-agents-resize.mjs`, 11/11 PASS
      on iso :5216
