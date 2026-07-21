## 1. Panel visibility state

- [x] 1.1 Dashboard.jsx: `claudeweb_dash_panels` read/clamp helpers (default
      all-hidden, try/catch degrade) + `panels` state and `togglePanel`
- [x] 1.2 Derive effective visibility (chip state AND `autopilotOn` /
      `agentAuditOn`), gate the three aux sections' JSX on it, and compute
      `dragKeys` from visible panels only
- [x] 1.3 Re-anchor effects: add visibility flags to the `floatTop` measure
      effect deps; confirm seeding/clamping work on the reduced citizen set

## 2. Panel rail UI

- [x] 2.1 Rail chip group on the shared header bar (pressed state,
      aria/tooltips, feature-gated chips)
- [x] 2.2 dashboard.css: chip styles + docks-only spacing check on both wide
      and narrow (wrap) viewports
- [x] 2.3 i18n keys for the three chips (en + translations)

## 3. Verify

- [x] 3.1 Build client; Playwright on an isolated preview port:
      fresh-device docks-only, chip toggle on/off, persistence across reload,
      hidden-Autopilot issues no /api/autopilot requests, layout state
      survives hide/show (verify-panel-rail.mjs — 16/16 on :5216)
- [x] 3.2 Sweep existing dashboard Playwright suites for assumptions that aux
      panels are mounted; seed `claudeweb_dash_panels` where needed (only the
      three new suites touch aux-panel selectors, all seed the key; older
      suites drive only the always-mounted docks/agents area)
- [x] 3.3 `openspec validate dashboard-focus-docks --strict` + understanding-app
      update for the new dashboard composition
