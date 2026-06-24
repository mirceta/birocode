# Add a dead-man's switch to the portable deploy

## Why

The committed `swap.ps1` made deploying the Harness to live `:5099` portable and
machine-independent (origin/main guard, build+stage **before** stop, swap into the
standard `run-bin`, restart + health-check). Its **stage-before-stop** design only
protects against a **build** failure. It does **not** protect against a build that
swaps in cleanly, health-checks green, and then **breaks down minutes later with no
operator at the keyboard** — the exact failure the original off-box deploy guarded
with a timed auto-rollback. The portable port had **dropped** that safety.

This change restores the auto-rollback fully inside the committed, `$PSScriptRoot`-
relative model, so any agent on any checkout gets the same protection without local
setup. It carries two hard-won lessons forward verbatim: restore with `robocopy /MIR`
(never a plain copy), and arm with a real `DateTime` trigger (never `schtasks /SD`,
which locale-parsed `06/12` as Dec 6th on this `dd.MM` box and silently never fired —
the 2026-06-12 incident).

## What changes

- New `rollback.ps1` — restores `run-bin.lastgood` → `run-bin` (`/MIR`, preserving
  `logs/` + `appsettings.json`), restarts, health-checks, self-deletes the task;
  aborts if no snapshot exists; `-NoStart` restores files only (used by the test).
- New `arm-rollback.ps1` — registers the one-time `ClaudeWebAutoRollback` scheduled
  task via `Register-ScheduledTask` with a real `DateTime`.
- New `keep.ps1` — the "keep it" disarm; deletes the task so the deploy stays live.
- `swap.ps1` — snapshot `run-bin` → `run-bin.lastgood` **before** the destructive
  swap (skipped on cold deploy); after restart: health FAILED → roll back inline;
  health OK → arm the timer; `-NoArm`/no-snapshot → don't arm. Adds `-RollbackMinutes`
  (default 15) and `-NoArm` flags.
- `CLAUDE.md` + `PreviewDoc.cs:SelfDoc` (managed `docs/claude-web/self-dev.md`) — the
  "keep it" / `keep.ps1` rule and the two non-obvious invariants (`/MIR` over copy,
  real `DateTime` over `/SD`).
- `understanding-app/index.html` — companion visualization of the two deploy
  dead-man-switch mechanisms side by side.

This change migrates `plans/portable-deploy.md` into OpenSpec (the portable `swap.ps1`
core itself already shipped; this is the dead-man's-switch addition on top).

## Impact

- Affected spec: **`deploy`** (new capability — ADDED requirements for the deploy
  safety net: last-good snapshot, armed auto-rollback, disarm, inline rollback on
  health failure, locale-safe scheduling).
- Affected code: `swap.ps1`, `rollback.ps1`, `arm-rollback.ps1`, `keep.ps1`,
  `CLAUDE.md`, `PreviewDoc.cs`, `understanding-app/index.html`. No Product runtime or
  API change — this is deploy tooling.
