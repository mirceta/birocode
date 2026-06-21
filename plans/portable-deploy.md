# Portable deploy — one committed `swap.ps1` any agent can run

> **Status (2026-06-21):** **SHIPPED to live + dead-man's switch restored.** The
> committed `swap.ps1` ran a real cutover to `:5099` (the autopilot "How chat works"
> deploy). Then we found the port had **dropped the auto-rollback safety** the old
> off-box deploy had — the whole reason the rollback machinery existed — so it's now
> ported into the committed model too (`rollback.ps1` / `arm-rollback.ps1` /
> `keep.ps1`, all `$PSScriptRoot`-relative). Verified end-to-end on isolated temp dirs
> + a TEST-named scheduled task (17/17): parse/ASCII clean, snapshot+restore round-trip,
> `/MIR` mirror-away, `/XF`+`/XD` runtime-state protection, no-snapshot guard, and
> arm/disarm with a real-`DateTime` trigger (no locale bug). On
> `feature/autopilot-loop-mode`.
>
> _History:_ originally **BUILT & VALIDATED (dry-run)** on `feature/portable-deploy`
> as a committed, machine-independent replacement for the untracked, hardcoded
> `.selfdev-build/deploy.ps1` that existed on only one machine. Parses under Windows
> PowerShell 5.1 and pwsh; the origin/main guard caught a real divergence mid-work.

## Problem

Deploying this repo's own Product (the Harness) to live `:5099` "just worked" for one
agent and was **impossible** for another — exactly the machine-dependent setup we
don't want. Root causes, all verified:

1. **The deploy script was local + untracked.** The working mechanism was
   `.selfdev-build/deploy.ps1` + `restart-harness.ps1` in a **gitignored** dir, with
   **hardcoded** `C:\Users\km\…` paths. No other checkout had it; a second agent had
   to invent one blind.
2. **The documented chokepoint was fiction.** `docs/claude-web/self-dev.md` (generated
   from `PreviewDoc.cs:SelfDoc`) promised a `swap.ps1` that **enforces** the origin/main
   guard. **No such file existed in git.**
3. **Wrong target assumption.** Live actually runs from a **copy**
   (`.selfdev-build\run-bin\ClaudeWeb.exe`), not in-place `bin\Debug` (which is locked
   while serving). A second agent assumed the locked path and couldn't build.
4. **The real local script skipped the guard entirely** — contradicting the doc's
   "ENFORCED at the chokepoint" claim.

Not fixable purely in-repo (documented/worked around instead): an agent's **sandbox
permission** policy, and the **self-terminating restart** (killing `ClaudeWeb.exe`
kills the agent hosted by it). Both are handled by **launching the deploy detached**
so it outlives the restart.

## Solution — `swap.ps1` at the repo root

One committed script, all paths resolved from `$PSScriptRoot`:

1. **Guard** — `git fetch` + `merge-base --is-ancestor origin/main HEAD`; **aborts,
   leaving live untouched**, if the tree predates origin/main (the real version of the
   doc's promise; prevents the 2026-06-11/12 clobber class of incident).
2. **Build + stage** client + backend into `.claudeweb-deploy/` (gitignored) **before**
   stopping anything — a broken build can only abort, never half-write live.
3. **Discover** the process serving the port, then swap into the **standard
   repo-relative `.selfdev-build/run-bin`**, migrating in-place installs so every
   machine converges to the same lock-free layout.
4. **Swap** with `robocopy /MIR` but **protect runtime state** — `/XD logs`,
   `/XF appsettings.json` (the data store lives in `%APPDATA%\ClaudeWeb`, untouched).
5. **Restart + health-check** `:5099`.

Robustness: **pure-ASCII** (BOM-less UTF-8 + em-dashes broke Windows PowerShell 5.1's
`ParseFile`, so a default `powershell -File` would fail to parse on another box);
**UTF-8 log**; `-DryRun`, `-Port`, `-Configuration`, `-SkipGuard` flags. Meant to be
launched **detached**: `cmd /c start "" /b pwsh -NoProfile -File .\swap.ps1`.

## Dead-man's switch (restored 2026-06-21)

`swap.ps1`'s stage-before-stop only protects against a **build** failure. It does
**not** protect against a build that swaps in cleanly, health-checks green, and then
**breaks down minutes later** with no operator at the keyboard — the exact failure the
original off-box deploy guarded with a timed auto-rollback. The portable port dropped
it. Now re-added, fully inside the committed model:

1. **Snapshot before swap** — after stopping live and *before* the destructive `/MIR`,
   `swap.ps1` mirrors the current `run-bin` → **`run-bin.lastgood`** (excludes `logs/`).
   This is the "previous good build to roll back to" the `/MIR` swap otherwise destroys.
   Skipped on a cold deploy (nothing good to capture).
2. **`rollback.ps1`** — restores `run-bin.lastgood` → `run-bin` with `robocopy /MIR`
   (preserving `logs/` + `appsettings.json`), restarts, health-checks, and self-deletes
   the task. Aborts (exit 1, live untouched) if no snapshot exists. `-NoStart` restores
   files only (used by the test).
3. **`arm-rollback.ps1`** — registers a one-time scheduled task `ClaudeWebAutoRollback`
   to run `rollback.ps1` in `-RollbackMinutes` (default 15). Uses `Register-ScheduledTask`
   with a real `DateTime`, **never `schtasks /SD`** (locale-parsed; armed `06/12` as
   Dec 6th on this dd.MM box — 2026-06-12 incident, harness down, rollback never fired).
4. **`keep.ps1`** — the "keep it" disarm; deletes the task so the deploy stays live.

`swap.ps1` wiring after restart: **health FAILED** → roll back immediately (inline);
**health OK** → arm the timer; **`-NoArm`** or **no snapshot** → don't arm. The two
hard-won lessons (`/MIR` over copy; real `DateTime` over `/SD`) are ported verbatim
from `claudeweb-rollback/` and recorded in the script headers.

## Validation

- ASCII parse confirmed under the strict 5.1 `ParseFile` reader (the failure mode that
  bit the other agent).
- `-DryRun` ran green end-to-end: guard OK → frontend build → backend build (0 errors,
  so the `PreviewDoc.cs` doc change compiles) → stage → stopped before touching live
  (`:5099` stayed at 200).
- The guard **aborted correctly** when `origin/main` advanced mid-work, then **passed**
  after merging origin/main — proving the safety path both ways.

## Docs

`PreviewDoc.cs:SelfDoc` (source of the managed `self-dev.md`) and the on-disk doc now
describe the real `swap.ps1`, the run-from-copy model, the detached launch, and the
actual guard — closing the dangling reference.

## Deferred

- **Real auto-rollback fire drill on live** — the dead-man's switch is verified on
  isolated temp dirs + a TEST task, not yet observed firing against an actually-broken
  live deploy (would require intentionally shipping a broken build). The mechanics are
  proven; the live fire path is the same code.
- Optionally retire the off-box `claudeweb-rollback/` (old `swap.ps1`/`arm.ps1`/
  `rollback.ps1`) and the `.claudeweb-deploy/deploy-run.ps1` + `ClaudeWebDeployOnce`
  task that still point at it — superseded by the committed in-repo scripts.
