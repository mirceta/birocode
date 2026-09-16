## 1. Build

- [x] 1.1 `FleetAccountsStore` (record per account: plan, usage, capturedAt, lastSeenAt,
      machines; pure `Merge`; `fleet-accounts.json` written only on change) + registration
      in `ArchModuleExtensions`; `FleetStatus()` feeds it and returns `accountsLastSeen`.
- [x] 1.2 `fleetStatusTabs.js`: export `usageRows` (the Overview's builder) and add
      `accounts` to `FLEET_TABS`; `fleetAccounts.js` (`accountsView`, `accountsSummary`).
- [x] 1.3 `FleetAccountsPanel.jsx` + `FleetStatus.jsx` wiring (label "By plan / accounts",
      renders instead of machine cards) + `fleetOverview.css` chips/stale styling.
- [x] 1.4 Rebuild and commit the Management App bundle (`events-app/manage`).

## 2. Verify

- [x] 2.1 .NET suite green incl. `FleetAccountsStoreTests` (3); client suite green incl.
      `fleetAccounts.test.mjs` (5) and the updated tabs test.
- [x] 2.2 Headless on an isolated instance with a seeded retired account: tab present and
      deep-linkable, live card = self account with meters equal to the Overview's, stale
      card from memory with "Last seen 2 h … (was on old-laptop)", memory persisted to
      `fleet-accounts.json`, subtab choice persists across reload.
      DONE 2026-09-17: 27/27 checks (`out-fleet-accounts.log`).

## 3. Ship

- [ ] 3.1 Push `feature/fleet-by-account`, open the PR against main. Merge and deploy on
      the Operator's word (the task brief says do not merge, do not deploy).
