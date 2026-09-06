## 1. Build

- [x] 1.1 `BoardVerifier`: one pass over every not-done card — local facts as before,
      then PR facts from GitHub for any card that names a PR (URL, or branch in the
      assignee repo's GitHub remote), whichever machine the assignee is on; live check
      from the peer's / hub's build; forward-only through `ApplyVerification`.
- [x] 1.2 `IPrFactsProbe` on `GitTaskFactsProbe`: `gh pr view --repo` / `gh pr list --repo
      --head` from the temp dir, `merge-base --is-ancestor` in a clone, `origin` URL.
- [x] 1.3 `ITaskFleetInfo` + `FleetTaskInfo` (arch module): remote assignee's remote URL and
      live commit from the cached peer describe; the hub's own live commit.
- [x] 1.4 Poller: singleton + hosted; first pass at startup = backfill; serialised
      `VerifyOnce`. `POST /api/taskgraph/verify`; Kanban "↻ Re-verify board" button.
- [x] 1.5 `ApplyVerification` clears the warning badge once the verified status is
      pr-merged or beyond.
- [x] 1.6 Tests: `TaskBoardVerifierTests` (remote from PR URL + deleted branch, idempotent
      backfill, by-branch lookup, left alone, live → done, pr-merged until live, non-harness
      done, local branch vanished, never demote / done skipped, reference parsing).

## 2. Verify

- [x] 2.1 Test suites green (.NET + client); isolated :5200 instance on a copy of the live
      store: `POST /api/taskgraph/verify` moves the nine stuck cards (bed0f74a, ce4eba2c,
      3c79fbec, 20ba36e5, 379f58b3, 76ee2c86, f9756383, f12f11af, 50e8275e) to pr-merged /
      done with prNumber + mergeCommit filled and the migration warning cleared.
      DONE 2026-09-06 14:47 — .NET 392 pass (13 new in `TaskBoardVerifierTests`); detached
      run `verify-board-remote.mjs` → `@@BOARDVERIFY@@ pass:true, 11 checks` (log
      `.claudeweb-preview/out-board-verify.log`): the startup pass alone took all nine
      remote cards from doing → done with PR #64/#66/#67/#68/#69/#70/#71/#73/#74 and their
      merge commits recorded, the hub's own 64c966f6 shed its leftover badge, a second pass
      moved nothing, the live board was untouched.

## 3. Ship

- [ ] 3.1 Commit on `feature/board-verify-remote`, merge origin/main, push, open the PR
      (task 26a1e633c3bc415183675278cb4b1050); merge and deploy on the Operator's word.

## 4. Follow-up (not this change)

- [ ] 4.1 Peer relay of commit/push facts: each peer's poller posts its local assignees'
      facts to the hub's board through the peer API.
