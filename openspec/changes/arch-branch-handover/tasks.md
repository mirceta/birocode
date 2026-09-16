## 1. Build

- [x] 1.1 `ArchClaims` (pure): the verdict table with reasons, the activity window, human
      turn detection, name-the-branch, the task-branch watch rule, the hand-over audit
      wording, and the `Assignment` record with `Adopted` / `TaskBranches` / `Pinned`.
- [x] 1.2 `ArchAgentService`: `VerdictOf` at every classification site; arch send times for
      the human test; `HandOver` / `PinRepo` / `ClaimPosture`; `ToolAdoptBranch` +
      `AdoptGate`; `PeerHandOver`; `read_transcript` override (local + peer); `state-branch`
      refusal on unassigned branches; `dispatch_task(branch)` + the branch watch on each
      wake; `claimedReason` / `pinned` / `adoptedBranches` in list_agents, git_state, the
      peer describe, the fleet status and the arch state; role prompt v5.
- [x] 1.3 `ArchStateStore.ClaimWindowMinutes`; `FleetClient.HandOver` + transcript override;
      `PeerRepo.ClaimedReason/Pinned/AdoptedBranches`; `POST /api/arch/handover`,
      `GET /api/arch/claim`, `POST /api/arch/claim-window`, `POST /api/arch/peer/handover`.
- [x] 1.4 MCP: `adopt_branch` tool; `operatorAsked` on `read_transcript`; `branch` on
      `dispatch_task`; descriptions name the reasons and the state-branch rule.
- [x] 1.5 Client: `HandToArch` control (dock git block, Management App Status card, feature
      `archHandover`), reasons on the Arch tab strip and the Status card, i18n en + tr;
      harness client and Management App bundle rebuilt.

## 2. Verify

- [x] 2.1 `ArchHandoverTests`: hand-over makes a claimed repo available, revoke claims it
      again, per-branch; pinned; window expiry (edge at exactly the window); default window
      2 h and operator override; human turn skips arch turns; name-the-branch rule; dispatch
      branch watch records once and revoke drops it; dispatch brief names the branch;
      adopt_branch refused without the ask; audit wording; assignment JSON round trip and
      legacy file. `ArchAgentTests` amended (rule table, sixteen tools, role v5).
- [x] 2.2 Full `dotnet test` green; `npm run build` and `build:manage` green (2026-09-06).
- [ ] 2.3 Live: hand a branch over from the dock, watch `list_agents` flip to available with
      no reason, `read_transcript` and `dispatch_task` succeed; take it back → claimed
      `human-active`; a dispatched task's branch appears under `taskBranches`.

## 3. Ship

- [ ] 3.1 Merge to main (PR), deploy with `swap.ps1` and keep on the operator's instruction;
      the arch home's `CLAUDE.md` is rewritten to v5 on the next arm.
