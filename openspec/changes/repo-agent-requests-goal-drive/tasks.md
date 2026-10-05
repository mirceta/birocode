## 1. Build

- [x] 1.1 `AgentRequestStore`: `Mode` (message | goal) and `GoalId` on the row; `MarkDelivered(mode, goalId, conversationId)`; the shared row view carries both.
- [x] 1.2 `ArchAgentService.Requests`: `ApproveAgentRequest(id, drive, maxIterations)` → `ApproveAgentRequestAsGoal` (goal first, then decide + deliver), `ComposeRequestGoal`, the goal state on the row view, the how-to; `StartGoal` overload handing back the started goal; the relayed message's footer teaches self-arming.
- [x] 1.3 `ArchController`: `POST /api/arch/requests/{id}/approve` body `{ drive?, maxIterations? }`.
- [x] 1.4 Arch guidance: role prompt v15 ("Requests from repo agents" + coordination rule; goal authorization by an approved request); `start_arch_goal` tool text.
- [x] 1.5 Tab: "Approve → drive as goal" button, goal badge + line, hint; i18n en + tr; `docs/agents.md`; Management bundle rebuilt.

## 2. Verify

- [x] 2.1 xunit `RepoAgentRequestsTests` +3 (mode/goal persisted and viewed, the goal text + the message footer, the guidance pins); role marker pins updated (2 files); full suite green.
- [x] 2.2 UI: `shot-manage-requests.mjs` approves r1 as a goal (POST with `drive: true`, the card shows goal running + the goal conversation); screenshot `manage-requests-goal.png`.
- [x] 2.3 Isolated-instance e2e (`.claudeweb-preview/requests-e2e.ps1`): approving a seeded request as a goal opens a goal conversation owning the managed self repo, the row shows mode goal + goalId, the goal is stopped; approving the same request again is refused.
- [ ] 2.4 Not covered: a real multi-step coordination driven to LOOP_DONE by the goal loop (the loop machinery is the existing one; the goal text and the wiring are what changed).

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
