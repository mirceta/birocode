## 1. Build

- [x] 1.1 `ArchGoals.TakesRepoWakes` + `NoWakeLoopReason` (pure rule).
- [x] 1.2 `ArchAgentService`: `ComposeWake` composes nothing for the default conversation;
      `Arm` refuses it; `RestoreStandingLoopIfNeeded` clears its memory and returns false;
      `ResumeLoopIfStopped` ignores it; `RetireDefaultWakeLoop` (engine tick).
- [x] 1.3 `AutopilotService` tick calls `RetireDefaultWakeLoop`; `ArchController` maps the
      refused arm to `400 { error }`.
- [x] 1.4 Arch page: the default conversation shows a note instead of the standing-loop
      card (`data-no-wakes`); Management App bundle rebuilt.
- [x] 1.5 Tests: `ArchGoalConversationsTests` (+2).

## 2. Verify

- [ ] 2.1 .NET + client suites green; on the live hub after deploy the log shows
      `[ARCH] wake loop on @arch retired` once and no further `resent to "Arch agent"`
      wake iterations; a sibling conversation's standing loop still composes wakes.

## 3. Ship

- [ ] 3.1 Commit on `feature/arch-default-no-wakes`, push, open the PR; merge and deploy
      on the Operator's word.
