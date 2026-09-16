# Design

## Data source: the Overview's, re-keyed

`ArchAgentService.FleetStatus()` already returns each machine's `overview` (the
`FleetOverview` capture with `claude {authenticated, account, plan, usage}`) for the
Overview subtab. The account view is a pure re-aggregation of exactly that list — the
client module `client/src/manage/fleetAccounts.js` (`accountsView`) groups machines by
`accountKey` (trim + lowercase, the same key the hub uses), picks the freshest capture
(`usage.fetchedAt`, else `capturedAt`) as the entry's usage, and builds the usage rows
with the **same** builder the Overview uses (`usageRows` in `fleetStatusTabs.js`, now
exported), so an account card can never disagree with the machine card. A unit test
asserts that parity (deep-equal rows).

Unreachable machines (no overview) and machines whose Claude is not signed in contribute
nothing to the live view.

## Last-seen memory on the hub

`FleetAccountsStore` (singleton, `<DataDir>/fleet-accounts.json`) is fed by
`FleetStatus()` on every poll with the observed `(machine, overview)` pairs. Its pure
`Merge(previous, observed, now)` refreshes every account seen in this pass (freshest
usage, machines list, `lastSeenAt = now`) and leaves every account NOT seen untouched, so
its last known state and `lastSeenAt` stay. The file is rewritten only when the JSON
changed (a quiet fleet costs nothing). `All()` (most recently seen first) is returned in
the fleet poll as `accountsLastSeen`; the client shows only the entries whose key is not
live right now, marked stale.

## Rendering

`FleetAccountsPanel.jsx` reuses the Overview's `OverviewRow` (meters, badges, tones) and
the machine-card chrome (`fs__machine`, `fs__mh`, `fs__filter` chips) so the subtab
looks like the rest of Fleet Status. Stale cards get `fs__machine--dark fs__account--stale`
and an "unknown"-toned "Last seen" row. Live cards sort by account; remembered ones by
`lastSeenAt` descending, after the live ones.

## Tests

- .NET: `FleetAccountsStoreTests` — grouping and freshest-wins; an unused account keeps
  its record; persistence and ordering across instances.
- Client: `fleetAccounts.test.mjs` — key folding, grouping/freshest, row parity with
  `overviewGroups`, stale rendering from memory, summary; `fleetStatusTabs.test.mjs` —
  the tab list and `?fleetTab=accounts`.
- Headless (isolated instance, seeded `fleet-accounts.json`):
  `.claudeweb-preview/playwright/verify-fleet-accounts.mjs`.
