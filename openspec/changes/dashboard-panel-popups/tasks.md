## 1. Dashboard pop-up layer

- [x] 1.1 Dashboard.jsx: `panelOrder` summon-order state; render `.dash__popup` layer (fixed, centered, stacked, × + Esc close); remove the three citizen sections
- [x] 1.2 Dashboard.jsx: delete citizen machinery — ideas wide/collapse/size, ideasFloating/floatTop, gridSwapped ⇄; `dragKeys = ['agents']`

## 2. Panel fill mode + styles

- [x] 2.1 AutopilotPanel/AgentAuditPanel `popup` prop: no saved size, no resize grip, always expanded, fill height
- [x] 2.2 dashboard.css: `.dash__popup*` styles; drop dead `.dash__auto/.dash__audit/.dash__ideas--*` + swap rules; i18n en/tr (add close-panel key, drop dead keys)

## 3. Verify

- [x] 3.1 Build client; Playwright on an isolated port: chips open/close centered pop-ups, stacking order, Esc, docks-only default; screenshot (`.claudeweb-preview/playwright/verify-panel-popups.mjs`, all green on :5217)
- [x] 3.2 `openspec validate dashboard-panel-popups --strict`
