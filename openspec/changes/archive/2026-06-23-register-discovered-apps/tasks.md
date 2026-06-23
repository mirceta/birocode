## 1. Register a discovered app from the dock

- [x] 1.1 Add a `registerApp(app)` handler in `PinnedAgent.jsx` that `POST`s `{ name, port }` to the existing `POST /repos/{id}/localapps` endpoint (the registered-apps path the Local tab uses), then awaits `reloadRepos()` from `useRepo()` so the dock's `localApps` prop, the app switcher, and the Local tab refresh
- [x] 1.2 Render a **Register** button on each discovered row (`.phone__discover-add`), disabled while its request is in flight
- [x] 1.3 Surface a per-row failure inline without aborting the rest of the discovered list

## 2. Show which discovered apps are already registered

- [x] 2.1 Derive `registeredPorts = new Set((localApps || []).map(a => a.port))` each render from the dock's `localApps` prop (no stored/optimistic flag)
- [x] 2.2 Render **✓ Registered** (`.phone__discover-reg`) instead of the button when a row's port is in `registeredPorts`; confirm a just-registered row flips on its own after `reloadRepos()`

## 3. i18n + styles

- [x] 3.1 Add the `dashboard.discoverRegister*` keys to `client/src/i18n/en.json` and `tr.json`
- [x] 3.2 Add `.phone__discover-add` / `.phone__discover-reg` styles to `client/src/pages/dashboard.css`

## 4. Verify + ship

- [x] 4.1 `npm --prefix client run build` clean
- [x] 4.2 Deployed to live `:5099` via `swap.ps1` (guard OK, staged build, health 200); Register / ✓ Registered confirmed working end to end by the operator
- [x] 4.3 `openspec validate register-discovered-apps --strict` clean; ready to archive on ship
