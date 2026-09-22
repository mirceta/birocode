# Tasks — status-open-harness

- [x] `FleetStatus.jsx` `AgentDetail`: the "open harness ↗" row beside the occupancy control, calling `focusAgentTab(agentTabKey, agentWorkerHref(machine, harnessRootFromLocation(), repoId))` — the Kanban badge's helper and inputs, not a copy; disabled with a reason when the machine's address is unknown.
- [x] `shot-status-open-harness.mjs` 7/7: peer tab key + URL equal the badge's, first click opens and navigates the named tab, second click focuses without reload, self agent uses this harness and the local key, unknown address disabled.
- [x] Management bundle rebuilt; branch + PR (no merge, no deploy).
- [ ] Not covered: the window-mode placement path in a real browser from this button (it is the same `focusAgentTab` call the badge makes; its window-mode behaviour was measured for the badge in openspec harness-window-agent-tabs / harness-window-reclick-raise).
