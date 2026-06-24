# Portable deploy — one committed `swap.ps1` any agent can run

> **Status (2026-06-21):** **BUILT & VALIDATED (dry-run); live cutover pending the
> operator.** A committed, machine-independent deploy script (`swap.ps1` at the repo
> root) replaces the untracked, hardcoded `.selfdev-build/deploy.ps1` that existed on
> only one machine. Parses under Windows PowerShell 5.1 and pwsh; `-DryRun` validated
> end-to-end (guard + full staged build); the origin/main guard already caught a real
> divergence mid-work. The destructive kill→swap→restart path mirrors the proven
> local deploy 1:1 (plus logs/appsettings protection) but has not been run against
> live yet. On `feature/portable-deploy`.

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

- **Live cutover** (the real kill→swap→restart + browser re-verify) — pending the
  operator's go-ahead; on this machine live already serves the current feature, so the
  cutover is low-value here and high-value on the other agent's box.
- Optionally retire/redirect the untracked `.selfdev-build/deploy.ps1` +
  `restart-harness.ps1` to thin shims that call `swap.ps1`.
