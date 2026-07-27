## 1. Frontend

- [x] 1.1 `AutopilotOverviewView.jsx` — static Overview content: honest tab-by-tab inventory + the two-loop plan (goal-based, queue-based)
- [x] 1.4 Third mode card: the already-built **suggestion-based loop** (routine-prompt library + end-of-turn classifier decision, suggest-only / auto-advance) alongside the two planned loops; plan section reworded to "three modes"
- [x] 1.2 `AutopilotConsole.jsx` — Overview first in the strip and default tab; tab strip always renders; gate-closed notice only for non-Overview tabs
- [x] 1.3 `autopilot.css` — `ov-*` styles (inventory list, plan feature cards) reusing the `ca-*` explainer look

## 2. Verify

- [x] 2.1 Build frontend; Playwright on an isolated port: Overview default-selected with both sections, gate-exempt behavior (operational tab shows gate notice when 403 / or data when open), dashboard pop-up shows the same default (`verify-autopilot-overview.mjs` + `probe-overview-gated.mjs`, both pass on :5218)
- [x] 2.2 `openspec validate add-autopilot-overview-tab --strict`
