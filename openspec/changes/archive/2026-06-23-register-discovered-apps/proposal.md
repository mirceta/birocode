## Why

`discover-local-apps` shipped as a **read-only** scan: each agent dock can discover the
directories in its repository that expose themselves as local apps and show the
`{ name, port }` list — but the operator then had to **retype that name and port** into
the Local tab's add-app form to actually register them. The two halves of the loop
(find it / register it) lived on different surfaces, so the discovered list was a
dead-end readout.

This change closes that loop **in the dock**: each discovered row gets a one-click
**Register** action that hands its name+port to the existing registered-apps endpoint,
and a row whose port is already registered shows a **✓ Registered** marker instead. The
discovery scan itself stays exactly as read-only as before — registration goes through
the pre-existing `POST /repos/{id}/localapps` path, not the discovery endpoint — so no
discovery guarantee is weakened.

## What Changes

- **Register action per discovered row** — in each agent dock's discover panel
  (`client/src/components/dashboard/PinnedAgent.jsx`), every discovered app gets a
  **Register** button that `POST`s `{ name, port }` to the existing
  `POST /repos/{id}/localapps` endpoint and then calls `reloadRepos()` so the dock's
  `localApps` (and the app switcher above it, and the Local tab) pick the new app up
  immediately. Per-row failures surface inline.
- **Already-registered indicator** — a discovered row whose port matches an entry in the
  dock's `localApps` shows **✓ Registered** instead of a button. The state is *derived*
  from the `localApps` prop, so a just-registered row flips on its own once
  `reloadRepos()` refreshes the dock — no local bookkeeping.
- **i18n + styles** — four `dashboard.discoverRegister*` keys (en/tr) and the
  `.phone__discover-add` / `.phone__discover-reg` styles.

## Capabilities

### Modified Capabilities

- `discover-local-apps`: the **dock affordance** now lets the operator register a
  discovered app (and shows which discovered apps are already registered), turning the
  discovered list from a readout into an actionable list. The discovery scan, its
  read-only endpoint, and its no-fan-out scope are unchanged.

## Impact

- **Frontend only.** `PinnedAgent.jsx` (register handler + per-row button/marker, derived
  `registeredPorts` set), `client/src/i18n/en.json` + `tr.json` (new keys),
  `client/src/pages/dashboard.css` (button/marker styles). No backend change.
- **Reuses, does not add, endpoints**: registration goes through the existing
  `POST /repos/{id}/localapps` (the registered-apps path that the Local tab already
  uses); the read-only `GET /local-apps/discover` is untouched.
- **No weakening of discovery guarantees**: the discovery scan remains read-only and
  per-repo; the "Read-only discovery endpoint" requirement (the discovery endpoint does
  not register) still holds because registration is a separate, operator-initiated call
  to a different endpoint.
