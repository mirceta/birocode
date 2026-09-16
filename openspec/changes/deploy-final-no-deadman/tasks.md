## 1. Build

- [x] 1.1 `swap.ps1`: no arming, no `-RollbackMinutes` / `-NoArm`; healthy = `deploy FINAL`,
      unhealthy = inline `rollback.ps1`; snapshot + guard + stage-before-stop + health
      check unchanged.
- [x] 1.2 Remove `arm-rollback.ps1`, `auto-keep.ps1`, `Deploy/templates/arm.ps1.tmpl`;
      `DeployScriptProvisioner.ScriptNames` = swap + rollback.
- [x] 1.3 `keep.ps1` → harmless no-op printing "keep is no longer needed" (removes a legacy
      timer if one exists). `rollback.ps1` header: a MANUAL rollback (and the inline
      health-failure restore); legacy timer cleanup only.
- [x] 1.4 `DeployService`: `ManualRollbackInfo` replaces the armed state; `POST /api/deploy/keep`
      removed; `RetireLegacyAutoRollback()` once at startup.
- [x] 1.5 `PeerUpgradeService`: `Outcome` rule — `done` when the target build answers, no arm
      wait, no disarm; `ArmGrace` gone; start message says the restart is final.
- [x] 1.6 Deployments tab: "Manual rollback" card (final note, last-good age, typed-confirm
      roll back); en/tr strings; CSS.
- [x] 1.7 Arch role prompt v11 (upgrade_peer: healthy restart is final); tests re-pinned.
- [x] 1.8 Docs: CLAUDE.md deploy section, `docs/claude-web/redeploy.md`,
      `docs/event-feed-contract.md`, WatchdogPlan comment.
- [x] 1.9 Tests: `DeployLifecycleTests` (+5), `PeerUpgradeTests` (+2).

## 2. Verify

- [x] 2.1 .NET + client suites green; `git grep` shows no tracked line telling anyone to run
      keep (only the retirement notes and the no-op itself).
      DONE 2026-09-16 — .NET 496 pass (+7), client 86 pass, client build green;
      sweep: remaining hits are CLAUDE.md's retirement note, `keep.ps1` itself,
      `DeployService`'s legacy-timer cleanup and historical change docs.
- [ ] 2.2 After merge, the first self-deploy from this tree logs `deploy FINAL` and no
      `ClaudeWebAutoRollback` task exists afterwards; an `upgrade_peer` job reads `done`
      as soon as the peer answers on the new build. (Operator's deploy.)

## 3. Ship

- [ ] 3.1 PR from `feature/deploy-no-deadman` against main (task e54683acc2a94da2a2d7a1a993933c45);
      merge and deploy on the Operator's word — no keep afterwards.
