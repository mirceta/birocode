# Tasks: dock-app-split-view

## 1. Dock — split mode rendering

- [x] 1.1 Restructure `.phone__screen` in `PinnedAgent.jsx` into a stable two-pane tree (design D2): `.phone__main` (alt views / cover app / always-mounted Chat) + conditional `.phone__side` (ProductFrame when split) — Chat's parent chain and sibling order identical in both modes
- [x] 1.2 Add `splitApp` dock-local state (design D1) with the toggle button next to the app switcher, visible only while an app is open; effective split = `splitApp && openApp` (◫ pill at the right edge of the apps row)
- [x] 1.3 Treat split as chat-showing (design D4): `chatShowing` includes `(!openApp || split)`, chrome-hiding conditions (`git`, discover, understanding) change from `!openApp` to `(!openApp || split)`; cover behavior unchanged
- [x] 1.4 Right pane hosts `ProductFrame` with the **same** `frameKey`/`frameMeta`/`zoomable` props as cover (design D3) so the keep-alive host preserves the iframe and per-frame zoom across mode switches

## 2. Dashboard — grid widening

- [x] 2.1 `onSplitChange(tabId, bool)` callback from `PinnedAgent` up to `Dashboard`; track split docks in Dashboard state (`splitDocks` map, cleared on dock unmount)
- [x] 2.2 Cell spans 2 columns while split (reuse the wide-cell span), guarded to column count ≥ 2 and top-level `<li>` cells (design D5); restores prior width (including an existing `wide` flag) on exit
- [x] 2.3 Pane sizing CSS in `dashboard.css`: `.phone__screen--split` row with panes `flex: 1 1 50%`, min-width floors (300/260px) and `overflow:hidden`; `.phone__screen >` child selectors retargeted to the new `.phone__main` wrapper (files/IDE/console surfaces unaffected)

## 3. Gating, i18n, styles

- [x] 3.1 Add `dockAppSplit: 'advanced'` capability to `UiModeContext.jsx` (design D6); Basic mode never sees the toggle and always gets cover
- [x] 3.2 i18n strings for the toggle (enter/exit split) in `en.json` + `tr.json` (`dashboard.splitToggle/splitHint/splitExitHint`)
- [x] 3.3 Styles for the toggle button + `.phone__side` following existing `phone__*` conventions (`.phone__split` rides the app-pill styling, pushed to the row's right edge)

## 4. Verify + ship gates

- [x] 4.1 `npm --prefix client run build` and isolated `dotnet build` pass; `tests/ClaudeWeb.Tests` stays green (32/32)
- [x] 4.2 Headless Playwright per `docs/claude-web/browser-testing.md` against an isolated :5200 instance: open app → toggle split → two panes with full chat visible; composer draft text survives the toggle; app in-page state survives cover→split→cover (no iframe reload); closing the app restores single-pane; cell span appears/restores (`.preview-test/split-view-check.mjs`, 27/27 PASS; screenshots eyeballed)
- [x] 4.3 `openspec validate dock-app-split-view --strict` passes; update `understanding-app/` with the split-view explanation (delta spec wording aligned with the built layout: chrome stays full-width above, the screen area splits)
- [x] 4.4 Deploy the feature branch to live via the persisted deploy task; user acceptance on live ("keep it" 2026-07-28), then sync + archive + merge to main
