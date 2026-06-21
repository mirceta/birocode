# Understanding — make self-dev deploy work on any machine

## What you asked for

Another agent (on a different checkout) couldn't redeploy the live harness, while
I always could. You want the **machine-dependence removed**: deploying this repo's
own Product (the Harness) to live `:5099` must work the same for *any* agent on
*any* machine — not depend on local, uncommitted setup that happens to exist on my
PC. You handed me that agent's problem writeup so I can fix the root cause **in the
application/repo**, not just on this box.

## Root cause (verified on this machine)

The deploy "mechanism" I've been using is **local and untracked**, so no other
checkout has it:

- `.selfdev-build/deploy.ps1` + `restart-harness.ps1` live in a **gitignored** dir
  (`.gitignore:22`) and **hardcode** `C:\Users\km\…\.selfdev-build`.
- Live (PID 67892) actually runs from `.selfdev-build\run-bin\ClaudeWeb.exe` — a
  **deployed copy**, *not* the in-place `bin\Debug` the other agent assumed (that
  exe is locked while serving, so it can't be built into).
- `docs/claude-web/self-dev.md` (generated from `PreviewDoc.cs:SelfDoc`) promises a
  `swap.ps1` chokepoint that **enforces the origin/main guard** — but **no such
  file exists in git**. The other agent chased a dangling reference.
- My local script **doesn't even implement the origin/main guard**, contradicting
  what the doc claims is enforced.

Not fixable purely in-repo (but I'll document/route around): the other agent's
**sandbox refusals** are its host's permission policy, and the **self-terminating
restart** (killing `ClaudeWeb.exe` kills the agent's host) is inherent — both are
handled by launching the deploy **detached** so it outlives the restart.

## What I'll do

1. **Commit one portable deploy script** at the repo root — `swap.ps1` (the name
   the doc already references, closing the dangling pointer). It will:
   - Resolve all paths from `$PSScriptRoot` — **no hardcoded user path**.
   - **Enforce the origin/main guard** (`git fetch` + `merge-base --is-ancestor`),
     aborting and leaving live untouched if it fails (the doc's real promise).
   - **Stage first, then stop**: build client + backend into `.claudeweb-deploy/`
     (already gitignored), only then kill `:5099` → swap → restart.
   - **Discover the live target** (the process listening on the port) and swap into
     a **standard `.selfdev-build/run-bin`**, migrating in-place installs so every
     machine ends up identical and lock-free.
   - **Protect runtime state**: `/MIR` but exclude `logs/` and `appsettings.json`
     (data already lives in `%APPDATA%\ClaudeWeb`, so it's safe).
   - Health-check `:5099` after restart; be safe to launch **detached**.
2. **Fix `PreviewDoc.cs:SelfDoc`** (the source of the managed `self-dev.md`) so the
   doc accurately describes the run-from-copy model, the committed `swap.ps1`, the
   detached-launch requirement, and the real guard — then regenerate the doc.
3. Retire the untracked `.selfdev-build/deploy.ps1`/`restart-harness.ps1` in favor
   of the committed script (or have them defer to it).

## Assumptions / things to confirm with you

- **Deploy-target model:** I recommend standardizing every machine on
  `.selfdev-build/run-bin` (discover current → swap → migrate if needed), vs.
  "redeploy wherever it currently runs." Need your pick.
- **Destructive test:** truly validating the script means running a **real deploy
  that kills and restarts live `:5099`**. I won't do that without your go-ahead.
- Live on *this* machine already serves prompt-plans (`/api/prompt-plans` → 401,
  not 404), so the deliverable here is the **portable tooling**, not re-deploying
  what's already up.

## Convention note

`self-dev.md` is **generated** (`<!-- managed by Claude Web -->`), so I'll change
it at its source in `PreviewDoc.cs` and regenerate — not hand-edit the `.md`.
Per the one-feature-per-branch rule this is on `feature/portable-deploy`.
