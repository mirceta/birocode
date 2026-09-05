## 1. Receiver (peer API)

- [x] 1.1 `ArchStateStore`: `acceptUpgrades` opt-in persisted beside `acceptSends`;
      `POST /api/arch/fleet {acceptUpgrades}`; exposed in `GET /api/arch` and the peer describe.
- [x] 1.2 `PeerUpgradeService`: job = fetch + checkout ref + detached `swap.ps1` via the
      one-shot scheduled-task launcher (deleted right after firing); job log tail + status.
- [x] 1.3 `POST /api/arch/peer/upgrade {ref?}` (409 when a job is running or opt-in off),
      `GET /api/arch/peer/upgrade/{id}`.
- [x] 1.4 Keep policy: auto `keep.ps1` when health passes and the describe reports the
      new version; otherwise let the dead-man switch restore last-good.
- [x] 1.5 Config-key carry: merge template-declared missing keys into the preserved
      live `appsettings.json` before the swap.

## 2. Caller (arch agent)

- [x] 2.1 `FleetClient.Upgrade(source, ref)` + poll.
- [x] 2.2 Tool `upgrade_peer(machine, ref?)`: armed + allow-sends + accepts-upgrades +
      version differs; audited; returns job id, then outcome on the next wake.
- [x] 2.3 Drift: `list_machines` + Fleet card show peer version vs hub version; wake
      briefing mentions drift.

## 3. Verification

- [x] 3.1 Unit tests: posture refusals (opt-in off, same version, disarmed); config-key
      carry merges only missing keys.
      DONE 2026-09-05: PeerUpgradeTests (posture table, commit suffix, key carry) + isolated
      e2e `.claudeweb-preview/upgrade-e2e.ps1` (17/17: opt-in round trip, describe, not-accepting,
      not-on-branch, dirty, 404s, Fleet card checkbox).
- [ ] 3.2 Two-instance ship gate (`tests/loop-eval/fleet.mjs` extension): B on an older
      commit, A's arch upgrades B, B comes back on the new version and reports it.
      NOT DONE: swap.ps1 always targets the standard live run dir, so a second instance
      cannot redeploy itself in isolation; covered instead by the live self-upgrade below.
- [ ] 3.3 Real fleet: this box upgrades MONSTER from main once, hands-off.
      Receiver side proven on THIS box first (2026-09-05): live deployed 16:46 by hand (the
      last hand deploy here), opt-in ticked, `POST /api/arch/peer/upgrade {ref: feature/work}`
      answered `current`; the next commit is applied by a real self-upgrade through that endpoint.
      MONSTER still needs one hand deploy (its build has no upgrade endpoint) + its opt-in.

## 4. Ship

- [ ] 4.1 Deploy both boxes by hand one last time; understanding app + docs.
      This box: deployed 2026-09-05 16:46 (71fd81a) and kept; understanding app phase-3 view +
      docs/event-feed-contract.md §5.1 done. MONSTER: pending (operator).
