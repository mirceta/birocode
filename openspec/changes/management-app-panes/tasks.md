## 1. Build

- [x] 1.1 `ManageApp.jsx`: layout state (tabs | panes, persisted + URL), hidden set,
      pane weights, drag gutters with pointer capture, pane bars with hide, narrow
      fallback; `manage.css`; i18n (en + tr).
- [x] 1.2 `npm run build:manage`; commit the bundle.

## 2. Verify

- [x] 2.1 Browser check on live through the proxy path: switch to side by side →
      three panes; hide one → two panes and the header button reflects it; the last
      pane cannot be hidden; drag a gutter → widths change and persist across reload;
      back to tabs → one view; no page errors.
      DONE 2026-09-05 (`.claudeweb-preview/playwright/check-manage-panes.mjs` on live, 17/17):
      three panes, hide/show via × and header buttons, last pane refuses to hide, gutter
      drag +100 px persists across reload (clamped by the 220 px pane minimum), tabs
      again, narrow-window fallback with note, no page errors. Live at once (bundle
      served from the worktree), no harness deploy.
