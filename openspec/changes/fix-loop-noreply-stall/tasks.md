# fix-loop-noreply-stall — tasks

## 1. Engine

- [x] 1.1 No-reply escape in the drive dedup guard: grace tick, then clear
      `_lastDriveSent` and fall through to the kind's decision; surface the
      interim "run done with no new reply — retrying" state.
- [x] 1.2 Consecutive-miss counter: resolve `error` / `no-reply` after 3
      reply-less runs; reset on a moved snippet; clear both guards on re-arm.

## 2. Verify

- [x] 2.1 `dotnet build` clean.
- [x] 2.2 Isolated-port e2e: force the no-reply condition against a drive
      loop and assert the retry send fires (iteration advances) instead of a
      stall, and that the miss ladder resolves `error` / `no-reply`.
- [x] 2.3 `openspec validate fix-loop-noreply-stall --strict`.
