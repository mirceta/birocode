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
      REAL SELF-UPGRADE #1 (2026-09-05 16:47, job 0a524e51d4b5, 71fd81a → 32de731): the
      endpoint pulled, launched swap.ps1 detached, live restarted on the target build and the
      new process marked the job `done`. Two defects surfaced and are fixed in the next build:
      the startup reconcile disarmed BEFORE swap.ps1 armed the switch (16:47:57 vs 16:48:05,
      so the arm won) → the reconcile now loops until the arm lands, then disarms; and the
      one-shot `ClaudeWebPeerUpgrade` task outlived the killed process → deleted synchronously
      after launch and again by the new process. Also `fromCommit` is now the running build.
      SELF-UPGRADE #2 PASSED (2026-09-05 16:51, job 5cfdd84af033, 32de731 → 43f0124): pull,
      detached swap, restart on the target, launcher task deleted at 16:52:08, switch armed
      16:52:15, harness disarmed it 16:52:20 (after the arm), job `done` "kept", no tasks left.
      This box now upgrades itself hands-off from the peer endpoint. Only MONSTER's first
      arch-driven upgrade is outstanding (needs its one hand deploy + opt-in).

## 4. Ship

- [ ] 4.1 Deploy both boxes by hand one last time; understanding app + docs.
      This box: deployed 2026-09-05 16:46 (71fd81a) and kept; understanding app phase-3 view +
      docs/event-feed-contract.md §5.1 done; since then this box moved to 43f0124 by two
      self-upgrades through the peer endpoint (no more hand deploys here). MONSTER: pending
      (operator: deploy feature/work or merged main there once, tick "accept fleet upgrades").
