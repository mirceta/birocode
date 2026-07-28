# Tasks: split-divider-drag

## 1. Divider — element, drag, ratio state

- [ ] 1.1 Add `splitRatio` state (percent, default 50) in `PinnedAgent.jsx` next to `splitApp`; in split, apply inline `flex: 1 1 <ratio>%` / `<100-ratio>%` to `.phone__main` / `.phone__side` (design D2)
- [ ] 1.2 Render `.phone__divider` between the panes only while split (design D1) — panes' DOM identity untouched (chat stays last child of main; frame slot stays in side)
- [ ] 1.3 Pointer drag (design D3): `onPointerDown` captures the pointer; `pointermove` sets ratio from `clientX` against the screen row's rect; `pointerup`/`pointercancel` end the drag; `phone__screen--dragging` class disables iframe pointer-events + pins `col-resize` cursor and no-select during drag
- [ ] 1.4 Clamp ratio to the 300px/260px floors converted to percent of the current row width, 20–80% fallback when too narrow (design D4)
- [ ] 1.5 Double-click resets to 50; `role="separator"`, `aria-orientation="vertical"`, `tabIndex=0`, ArrowLeft/ArrowRight nudge by 2% (design D5)

## 2. Styles + i18n

- [ ] 2.1 `.phone__divider` styles in `dashboard.css` following `phone__*` conventions: slim visible line with a wider hit area, hover/active highlight, `cursor: col-resize`; `--dragging` guard rules
- [ ] 2.2 i18n label/hint for the divider (`dashboard.splitDivider*`) in `en.json` + `tr.json`

## 3. Verify + ship gates

- [ ] 3.1 `npm --prefix client run build` passes; isolated `dotnet build` + `tests/ClaudeWeb.Tests` stay green
- [ ] 3.2 Headless Playwright per `docs/claude-web/browser-testing.md` against an isolated :5200 instance: drag moves the boundary (pane widths change), no iframe reload (in-app state survives a drag), clamp stops at floors, double-click restores 50/50, ratio survives split off/on, second dock unaffected
- [ ] 3.3 `openspec validate split-divider-drag --strict` passes; refresh `understanding-app/` with the divider behavior
- [ ] 3.4 Deploy the feature branch to live via the persisted deploy task; user acceptance on live ("keep it"), then sync + archive + merge to main
