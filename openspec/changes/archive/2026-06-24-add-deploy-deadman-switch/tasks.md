# Tasks

## 1. Snapshot before swap
- [x] In `swap.ps1`, after stopping live and **before** the `/MIR` swap, mirror `run-bin` → `run-bin.lastgood` (`/XD logs`); skip on cold deploy

## 2. Rollback script
- [x] `rollback.ps1` — `/MIR` restore `run-bin.lastgood` → `run-bin` (`/XD logs`, `/XF appsettings.json`), restart, health-check, self-delete the task
- [x] Abort (exit 1, live untouched) when no `run-bin.lastgood` snapshot exists
- [x] `-NoStart` flag restores files only (for the isolated test)

## 3. Arm / disarm
- [x] `arm-rollback.ps1` — `Register-ScheduledTask ClaudeWebAutoRollback` with a real `DateTime` (never `schtasks /SD`)
- [x] `keep.ps1` — delete the task ("keep it" disarm)

## 4. Wire into `swap.ps1`
- [x] After restart: health FAILED → roll back inline; health OK → arm; `-NoArm`/no-snapshot → don't arm
- [x] Add `-RollbackMinutes` (default 15) and `-NoArm` flags

## 5. Docs
- [x] `CLAUDE.md` + `PreviewDoc.cs:SelfDoc` (managed `docs/claude-web/self-dev.md`) — the "keep it"/`keep.ps1` rule and the two invariants (`/MIR` over copy; real `DateTime` over `/SD`)

## 6. Understanding app
- [x] `understanding-app/index.html` — both deploy dead-man-switch mechanisms rendered side by side

## 7. Verify
- [x] Isolated temp-dir + TEST-named-task drill (17/17): ASCII parse under 5.1 `ParseFile`, snapshot+restore round-trip, `/MIR` mirror-away, `/XF`+`/XD` runtime-state protection, no-snapshot guard, arm/disarm with real-`DateTime` trigger
- [x] `-DryRun` green end-to-end (guard OK → builds → stage → live untouched at 200)
- [x] **Real live fire drill** — on 2026-06-24 the armed `ClaudeWebAutoRollback` fired against live `:5099`, restored last-good, restarted, health 200 (the previously-deferred live-fire path, now observed)
