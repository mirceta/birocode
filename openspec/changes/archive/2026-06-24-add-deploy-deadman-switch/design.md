# Design — deploy dead-man's switch

## Where it sits in `swap.ps1`

The switch wraps the existing portable-deploy flow at two points:

1. **Snapshot before the destructive swap.** After stopping live and *before* the
   `robocopy /MIR` that overwrites `run-bin`, mirror the current `run-bin` →
   `run-bin.lastgood` (excluding `logs/`). `/MIR` would otherwise destroy the only
   "previous good build" to roll back to. Skipped on a cold deploy (nothing good to
   capture) — and a cold deploy therefore cannot auto-rollback (recorded explicitly).
2. **Arm or roll back after the restart + health-check.**
   - health **FAILED** → roll back immediately, inline (don't wait for the timer).
   - health **OK** → arm the timer for `-RollbackMinutes` (default 15).
   - `-NoArm`, or no snapshot was captured → don't arm.

## The three committed helpers (all `$PSScriptRoot`-relative)

- **`rollback.ps1`** — `robocopy /MIR` `run-bin.lastgood` → `run-bin`, preserving
  `logs/` (`/XD`) and `appsettings.json` (`/XF`); restart; health-check; self-delete
  the scheduled task. Aborts (exit 1, live untouched) if `run-bin.lastgood` is absent.
  `-NoStart` restores files only, for the isolated test.
- **`arm-rollback.ps1`** — `Register-ScheduledTask ClaudeWebAutoRollback` to run
  `rollback.ps1` once at `now + RollbackMinutes`.
- **`keep.ps1`** — deletes `ClaudeWebAutoRollback`. The operator's "keep it".

## Two invariants ported verbatim (the reason this exists)

- **`robocopy /MIR`, never a plain copy.** A copy leaves stale files behind; only a
  mirror reproduces the last-good tree exactly. Used for both the snapshot and the
  restore, with `/XD logs` + `/XF appsettings.json` so runtime state survives.
- **A real `DateTime` trigger, never `schtasks /SD`.** `schtasks` locale-parses the
  start date; on this `dd.MM` box it armed `06/12` as **Dec 6th**, so the rollback
  never fired and the harness stayed down (2026-06-12 incident).
  `Register-ScheduledTask` with a `DateTime` object is locale-proof.

## Trade-offs

- **15-minute default window.** Long enough to eyeball a deploy, short enough that an
  unattended break self-heals. Tunable via `-RollbackMinutes`; `-NoArm` opts out.
- **`%APPDATA%\ClaudeWeb` is never touched.** The data store lives outside the build
  dirs, so rollback swaps binaries only — no data loss either direction.
- **Launch detached.** `swap.ps1` kills and restarts the harness that may host the
  agent, so it is launched detached to outlive the restart; the rollback task runs
  independently of any agent session.
