## 1. Build

- [x] 1.1 `components/shared/openAgent.js`: `agentKeyOf`, `machineOf`, `resolveAgentTarget` (reasons), `openAgentHarness`, `rememberFleet`.
- [x] 1.2 `components/shared/OpenAgentNotice.jsx` (mounted once: ManageApp, IdeasPanel); `openNotice.js` texts for the target reasons; the Status tab's local notice removed.
- [x] 1.3 Callers: FleetStatus chip + button, KanbanBoard chip + expanded-card "⧉ Open harness", TaskGraphPanel node + assignee chips, RecurringTab chip, AgentRequests row; every fleet poll remembers the fleet.
- [x] 1.4 `workerWindow.js`: dedicated-window mode falls back to a tab beside the dashboard on no-launcher / blocked and announces its outcomes.

## 2. Verify

- [x] 2.1 node `openAgent.test.mjs` (keys, machine resolution, every reason, open vs announce, remembered fleet); the full client suite.
- [x] 2.2 Lab e2e `.claudeweb-preview/card/verify.mjs` on the real board: card 10922cb3 chip fresh → opened + notice on the Kanban; existing tab on another agent → steered + notice; the expanded card's button; the dashboard inside the agent's named tab → fresh tab + notice; Task graph node; Status tab regression. Screenshots `docs/screenshots/card-open-*.png`.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
