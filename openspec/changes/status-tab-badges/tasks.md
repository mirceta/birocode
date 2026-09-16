## 1. Build

- [x] 1.1 `client/src/manage/statusBadges.js`: pure descriptors — `machineBadges`,
      `machineMeta`, `splitReason`, `branchBadges`, `agentDetailBadges`; unit tests in
      `statusBadges.test.mjs` (in `npm --prefix client test`).
- [x] 1.2 `client/src/manage/StatusBadge.jsx` + `.fs__badge` styles (manage.css, light +
      dark) and the Overview badge row styles (fleetOverview.css).
- [x] 1.3 `FleetStatus.jsx`: head hub build, machine header posture + counts, agent
      detail rows, stale rows render badges. `FleetOverviewPanel.jsx`: toned values as
      badges with the reason beside. `fleetStatusTabs.js`: Version/Build mono, Stale
      tasks counts the list.
- [x] 1.4 Management App bundle rebuilt.

## 2. Verify

- [x] 2.1 `client/tests/ui/shot-status-badges.mjs` (Playwright, mocked fleet: hub with a
      full overview, a behind peer with no overview + a stale card, an unreachable
      peer): after — 19 header badges, 0 raw "a · b · c" runs in a header, 9 detail
      badges with both data hooks, 77 Overview rows and 0 toned rows without a badge,
      chip labels still machine-free, no page errors; light + dark. Screenshots
      `docs/screenshots/status-badges-{agents,overview}-{before,after}.png`,
      `status-badges-agents-dark-after.png`. DONE 2026-09-16.

## 3. Ship

- [ ] 3.1 PR against main; merge and deploy are the Operator's.
