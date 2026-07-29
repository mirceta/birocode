# Tasks: split-no-forced-wide

## 1. Decouple split from cell width

- [x] 1.1 `Dashboard.jsx`: remove `splitDocks` state + `handleSplitChange` + `splitWide`; cell class driven by `tab.wide` alone; drop `onSplitChange` prop from `renderDock`
- [x] 1.2 `PinnedAgent.jsx`: remove `onSplitChange` prop and the report-up effect

## 2. Fit any cell width

- [x] 2.1 `dashboard.css`: split pane floors become `min(300px, 45%)` / `min(260px, 38%)` (design D2)
- [x] 2.2 `PinnedAgent.jsx` `moveDivider`: clamp mirrors the container-aware floors; drop the 20–80 fallback (design D3)

## 3. Verify + ship gates

- [x] 3.1 `npm --prefix client run build` passes; `tests/ClaudeWeb.Tests` stays green
- [x] 3.2 Headless per `docs/claude-web/browser-testing.md`: entering split does NOT add `dash__cell--wide`; a manually-⤢-wide dock stays wide through split on/off; panes fit a normal-width cell (no horizontal overflow); divider drag/clamp/reset still pass (`split-drag-check.mjs` rerun)
- [x] 3.3 `openspec validate split-no-forced-wide --strict`; refresh `understanding-app/`
- [x] 3.4 Deploy branch to live via persisted deploy task; user acceptance ("keep it"); then archive + merge to main
