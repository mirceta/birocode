## 1. Build

- [x] 1.1 `TaskLifecycle`: `ClampClaim` / `CeilingRank` removed; `VerifiedCeiling`,
      `IsUnverified`, `WarningFor`; migration keeps the status and badges a done without
      merge evidence.
- [x] 1.2 `TaskGraphService`: `UpdateNode` recomputes the badge on a status change;
      `ApplyVerification` recomputes it after recording the facts (clears when verification
      catches up); migration text through `WarningFor`.
- [x] 1.3 `ArchAgentService.ToolUpdateTask`: no clamp — the status is applied exactly, the
      answer names the badge when one is on; `list_tasks` adds `unverified` + `verifiedAt`;
      role prompt v9 ("update_task moves the card; the harness annotates; report
      unverified cards"); MCP description.
- [x] 1.4 `BoardVerifier`: skips only cards verified done (a leftover badge there is
      recomputed away); a claimed done is checked until the facts catch up.
- [x] 1.5 Kanban: the badge reads "⚠ unverified" with the warning and the rule as its tooltip;
      "done ✓" tooltip says the harness keeps verifying. Bundles rebuilt.
- [x] 1.6 Includes openspec board-verify-remote (PR #75, branch feature/board-verify-remote,
      4831560): GitHub-direct PR verification for any card, merged PR = proof, backfill,
      `POST /api/taskgraph/verify` + "↻ Re-verify board".

## 2. Verify

- [x] 2.1 `TaskLifecycleTests`: unverified rule table, badge text, a claim moves the card
      exactly (pr-opened / pr-merged / back to doing) with the badge following, verification
      below the claim records facts and keeps the badge without demoting, migration keeps done.
      `TaskBoardVerifierTests`: a claimed done keeps done, is verified pr-merged (badge names
      the gap) then done + badge cleared once live, no extra gh call; a claimed done with no
      PR is checked and left alone. `ArchAgentTests` / `ArchGoalConversationsTests`: v9.
      Suite green.
- [x] 2.2 Isolated instance on a copy of the live store (`.claudeweb-preview/board-advisory-e2e.ps1`
      → `check-board-advisory.mjs`, real `gh`): the nine stuck cards at doing → after
      `POST /api/taskgraph/verify` all pr-merged / done with no warning; a fresh card moved to
      pr-merged by a claim keeps pr-merged with the badge, back to doing clears it; the Kanban
      shows "⚠ unverified" and the Re-verify button. Resulting board in the PR body.
- [ ] 2.3 Live (after merge + deploy): press "Re-verify board"; the arch's next `update_task`
      lands where it says.

## 3. Ship

- [ ] 3.1 PR against main (this task); the Operator merges and deploys.
