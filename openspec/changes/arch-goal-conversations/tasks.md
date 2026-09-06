## 1. Build

- [x] 1.1 `ArchGoals.cs` (pure): `ArchGoalRouting` (scope, tasks, busy, state, naming, loop
      goal text, inbox line) and `TaskLifecycle` (order incl. pr-opened / pr-merged, floor
      check, blocker sentence).
- [x] 1.2 `ArchStateStore`: goal fields per conversation, `StartGoal` / `ExtendGoal` /
      `EndGoal` / owners / queue / wake note, `LegacyBroadcast`, the bounded inbox with its
      watermark; old files load with defaults.
- [x] 1.3 `ArchAgentService.Goals.cs`: start (resolves handles, owns task assignees, refuses
      owned/unmanaged/gate-closed, new conversation + goal loop), stop, queue message, views,
      `GoalOwners`, `SweepInbox`, `CompletionBlocker`, `DecorateDrivenPrompt`,
      `OnDrivenResolved`, `ReconcileGoals`, summary delivery; `ComposeWake` scoped per
      conversation, `ComposeWakeCore` keeps owned `task.status`; `SendToArch` actor; fleet
      status `goal`; role prompt v7 "Goal conversations".
- [x] 1.4 `ArchDrivenPolicy.Apply` completion gate; `AutopilotService` tick hooks
      (reconcile, sweep, deliver), the gate callback, the decorated send, `OnDrivenResolved`
      after resolve; `TaskGraphService` publishes `task.status`; loops projection `goalOwners`.
- [x] 1.5 MCP: `start_arch_goal` / `list_arch_goals` / `stop_arch_goal`; `ArchController`:
      conversations + state carry goal/busy, goals endpoints, routing, inbox.
- [x] 1.6 UI: Loops lane goal card (start form, stop), busy banner + queue composer + header
      pill, Status tab Goal conversations card with the legacy toggle and the inbox,
      Management App tab marker ⏳ and auto-open of a started goal, fleet chip / detail and
      dock summary "driven by arch goal <id>" (i18n en + tr); both bundles rebuilt.

## 2. Verify

- [x] 2.1 `ArchGoalConversationsTests` (13): ownership + release + persistence, exclusivity,
      queue drain, routing owned vs unowned, default gets nothing unless legacy, task
      events by task or assignee, `task.status` published, inbox bound + persistence,
      legacy setting, busy state, naming, lifecycle blocker, completion gate, tools + role
      prompt. `ArchAgentTests` amended (23 tools, v7). Full suite 336 green.
- [x] 2.2 Isolated instance (`.claudeweb-preview/arch-goals-e2e.ps1` → `check-arch-goals.mjs`,
      own arch home, goal in suggest mode so no CLI turn runs): start → busy conversation
      owning the agent + the task's assignee; second goal refused as owned; message queued;
      fleet status + dock projection name the goal; unowned task change in the inbox, owned
      one not; Management App tab ⏳, banner + queue composer + header pill, Loops lane
      card, Status card + legacy toggle + inbox + chip; stop releases; re-own works.
- [ ] 2.3 Live (after merge + deploy): "arch, run a goal: … on spacex/prg" from the
      Operator-facing chat → a busy goal conversation that dispatches, is woken by its
      agents only, and posts its summary to the Operator-facing conversation.

## 3. Ship

- [ ] 3.1 PR against main (this task); the Operator merges and deploys.
