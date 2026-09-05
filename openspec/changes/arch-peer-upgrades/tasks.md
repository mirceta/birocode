## 1. Receiver (peer API)

- [ ] 1.1 `ArchStateStore`: `acceptUpgrades` opt-in persisted beside `acceptSends`;
      `POST /api/arch/fleet {acceptUpgrades}`; exposed in `GET /api/arch` and the peer describe.
- [ ] 1.2 `PeerUpgradeService`: job = fetch + checkout ref + detached `swap.ps1` via the
      one-shot scheduled-task launcher (deleted right after firing); job log tail + status.
- [ ] 1.3 `POST /api/arch/peer/upgrade {ref?}` (409 when a job is running or opt-in off),
      `GET /api/arch/peer/upgrade/{id}`.
- [ ] 1.4 Keep policy: auto `keep.ps1` when health passes and the describe reports the
      new version; otherwise let the dead-man switch restore last-good.
- [ ] 1.5 Config-key carry: merge template-declared missing keys into the preserved
      live `appsettings.json` before the swap.

## 2. Caller (arch agent)

- [ ] 2.1 `FleetClient.Upgrade(source, ref)` + poll.
- [ ] 2.2 Tool `upgrade_peer(machine, ref?)`: armed + allow-sends + accepts-upgrades +
      version differs; audited; returns job id, then outcome on the next wake.
- [ ] 2.3 Drift: `list_machines` + Fleet card show peer version vs hub version; wake
      briefing mentions drift.

## 3. Verification

- [ ] 3.1 Unit tests: posture refusals (opt-in off, same version, disarmed); config-key
      carry merges only missing keys.
- [ ] 3.2 Two-instance ship gate (`tests/loop-eval/fleet.mjs` extension): B on an older
      commit, A's arch upgrades B, B comes back on the new version and reports it.
- [ ] 3.3 Real fleet: this box upgrades MONSTER from main once, hands-off.

## 4. Ship

- [ ] 4.1 Deploy both boxes by hand one last time; understanding app + docs.
