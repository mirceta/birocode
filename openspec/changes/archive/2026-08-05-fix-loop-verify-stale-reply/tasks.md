# fix-loop-verify-stale-reply — tasks

## 1. Chat module

- [x] 1.1 `RunSession`: accumulate `token` text into `ReplyText`, stamp
      `ReplyTextAtUtc` on the last delta; thread-safe reads.

## 2. Engine

- [x] 2.1 Temporal freshness gate in `Tick`: for drive-mode driven kinds with
      `LastSentAt > 0`, the trailing transcript reply counts only if newer than
      the last send; witnessed-run fallback; otherwise reply-missing.
- [x] 2.2 Rework the no-reply escape onto the temporal signal: grace tick +
      miss ladder unchanged, but retry decides with `LastAssistant = null`
      (never stale text). `_lastDriveSent` demoted to debug evidence.
- [x] 2.3 Synthetic filter: transcript parser marks `model == "<synthetic>"`
      assistant messages; the pinned read skips them.

## 3. Kinds

- [x] 3.1 `QueueLoop`: verify phase with null reply → re-propose the composed
      verification prompt, stay in verify.
- [x] 3.2 `GoalLoop`: verify phase with null reply → re-propose the stored
      verification prompt, stay in verify.

## 4. Verify

- [x] 4.1 `dotnet build` clean; `npm --prefix client run build` untouched
      surfaces still build.
- [x] 4.2 Stub CLI simulator (streams stream-json, echoes resumed session id,
      persists nothing / appends synthetic / stays silent per mode file).
- [x] 4.3 Isolated-port e2e `verify-loop-verify-stale-reply.mjs`: queue drains
      to `done · drained` on witnessed-only replies; real failed verification
      escalates quoting the streamed text; silent runs resolve
      `error · no-reply`; synthetic repair lines are ignored.
- [x] 4.4 Re-run `verify-loop-noreply.mjs` and `verify-queue-loop.mjs`
      (regressions on the prior loop fixes).
- [x] 4.5 `openspec validate fix-loop-verify-stale-reply --strict`.
