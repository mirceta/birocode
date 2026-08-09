# Tasks — adopt-preexisting-ideas-on-join

## 1. Backend

- [x] 1.1 `IdeasSyncService.Nudge(bool targetChanged, bool becameEnabled)`: on
      first contact (`targetChanged || becameEnabled`) mark the board dirty
      with the push due immediately (and forget the seen rev on target change,
      as before), so the engine's next tick runs the pull-merge-CAS-push as
      the first exchange instead of a plain poll.
- [x] 1.2 `NotesController.PutSyncConfig`: compute `becameEnabled` from the
      before/after config and pass both flags.

## 2. Verify

- [x] 2.1 Isolated .NET Debug build (never the running app's bin).
- [x] 2.2 Two-instance isolated e2e (`verify-ideas-join-adoption.mjs`,
      :5240/:5241 pattern): B creates ideas BEFORE any sync config; hub A holds
      its own ideas plus a tombstoned (deleted) idea; B joins → hub holds the
      union, B holds the union, A's deleted idea stays deleted; offline-join
      branch: B pointed at a dead port keeps local ideas and converges after
      the URL is corrected; re-point branch: B moved to a second store seeds it.
- [x] 2.3 `openspec validate adopt-preexisting-ideas-on-join --strict`.

## 3. Wrap-up

- [x] 3.1 Commit on `feat/ideas-sync-join-adoption` + PR (user merges — main
      ruleset blocks agent merges).
