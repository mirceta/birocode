## 1. Build

- [x] 1.1 `ArchGoals.cs` (pure): busy, polls-only, state, naming, loop goal text.
- [x] 1.2 `ArchStateStore`: goal fields per conversation, `StartGoal` / `ExtendGoal` /
      `EndGoal` / owners / queue; old files load with defaults.
- [x] 1.3 `ArchAgentService.Goals.cs`: start (resolves handles, drives task assignees, refuses
      owned/unmanaged/gate-closed, new conversation + goal loop), stop, queue message, views,
      `GoalOwners`, `HasWake` (false for a goal conversation), `DecorateDrivenPrompt` (queued
      Operator messages only), `OnDrivenResolved`, `ReconcileGoals`, summary delivery;
      `SendToArch` actor; fleet status `goal`; role prompt v7 "Goal conversations".
- [x] 1.4 `AutopilotService`: tick hooks (reconcile, deliver), `HasWake` for the pacing, the
      decorated send, `OnDrivenResolved` after resolve; loops projection `goalOwners`.
- [x] 1.5 MCP: `start_arch_goal` / `list_arch_goals` / `stop_arch_goal`; `ArchController`:
      conversations + state carry goal/busy, goals endpoints.
- [x] 1.6 UI: Loops lane goal card (start form, stop), busy banner + queue composer + header
      pill, Status tab Goal conversations card, Management App tab marker ⏳ and auto-open of
      a started goal, fleet chip / detail and dock summary "driven by arch goal <id>" (en +
      tr); both bundles rebuilt.
- [x] 1.7 Simplified on the Operator's review (2026-09-06): event routing, task.status
      events, the inbox, the legacy-broadcast setting and the board-side completion gate
      removed — the arch polls, the agents stay passive.

## 2. Verify

- [x] 2.1 `ArchGoalConversationsTests` (7): ownership + release + persistence, exclusivity,
      queue drain, polls-only pacing (holds before the floor, sends at the floor, first
      send / verification at once, no wake ever), busy state, naming, tools + role prompt.
      `ArchAgentTests` amended (23 tools, v7). Full suite green.
- [x] 2.2 Isolated instance (`.claudeweb-preview/arch-goals-e2e.ps1` → `check-arch-goals.mjs`,
      own arch home, goal in suggest mode so no CLI turn runs): start → busy conversation
      driving the agent + the task's assignee; second goal refused `owned`; message queued;
      fleet status + dock projection name the goal; board changes and ticks wake nothing
      (the one pended poll is the goal prompt); Management App: ⏳ tab, banner + queue
      composer + header pill, Loops lane card, Status card, no routing knobs, chip; stop
      releases; re-own works.
- [ ] 2.3 Live (after merge + deploy): "arch, run a goal: … on spacex/prg" from the
      Operator-facing chat → a busy goal conversation that polls, dispatches and posts its
      summary to the Operator-facing conversation.

## 3. Ship

- [ ] 3.1 PR #71 against main; the Operator merges and deploys.
