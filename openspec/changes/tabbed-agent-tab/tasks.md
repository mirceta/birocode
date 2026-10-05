## 1. Build

- [x] 1.1 `Dashboard` solo mode (one tab, phones view, `renderDock` only); `pages/AgentView.jsx` + styles; route `/studio/agent`; feature `agentTab` (Advanced); i18n en + tr; `SettingsController.KnownTabs` accepts `agent`.
- [x] 1.2 `layout/tabOrder.js`: `sortTabs` (Agent after Chat by default), `landingPathForAgentLink`, `paneTabsWithoutAgent`, `isAgentPath`; `tabRegistry` uses it; `PaneStrip.useMultiPane` excludes the Agent tab; `Layout` renders the route full screen (`app-frame--agent`, `app-content--agent`).
- [x] 1.3 `DockContext`: the `?agent=` deep link navigates to the Agent tab.
- [x] 1.4 Client bundle + Management bundle rebuilt.

## 2. Verify

- [x] 2.1 node `tabOrder.test.mjs` ×4; client tests green.
- [x] 2.2 Real e2e on a built isolated instance (`.claudeweb-preview/agent-tab-e2e.ps1` → `e2e-agent-tab.mjs`): the link lands on the Agent tab at desktop and phone width; the tab stays full under a reordered, wide-span layout while Files gets the pane strip; the bottom nav works from it; Status → "open harness" and a Kanban badge open a new browser tab that lands on it; a repeat click focuses without a new page.
- [x] 2.3 Existing shots for the open-harness mechanics still pass (`shot-status-open-harness.mjs`, `shot-harness-window-tabs.mjs`).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
