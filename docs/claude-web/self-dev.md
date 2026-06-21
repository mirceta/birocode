<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on 5200:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
# robocopy /MIR, NOT Copy-Item: when the dest client/dist already exists Copy-Item
# nests the build into client/dist/dist (stale top-level shadows it). /MIR mirrors
# exactly and purges stale hashes. Exit codes 0-3 are success.
robocopy client/dist .claudeweb-preview/bin/client/dist /MIR /NFL /NDL /NJH /NP | Out-Null
$env:CLAUDEWEB_PORT = "5200"
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.

## Deploy to live with `swap.ps1` (the one committed chokepoint)

Deploying the Harness to live `:5099` is done by **`swap.ps1` at the repo root** —
a committed, machine-independent script so ANY agent on ANY checkout can deploy (no
local, uncommitted setup required). It resolves every path from its own location,
so there is nothing to configure.

Why you can't just `dotnet run`: the live `ClaudeWeb.exe` is **locked while serving**
and the agent is usually **hosted by that exe**, so stopping it stops the agent. The
script handles both: it **stages the whole build first**, then stop -> swap -> restart,
and it is meant to be **launched detached** so it OUTLIVES the restart it performs.

```powershell
# launch it detached, so killing the live harness mid-swap can't kill the deploy:
cmd /c start "" /b pwsh -NoProfile -File .\swap.ps1
# (or `powershell -File .\swap.ps1` — it is pure-ASCII so it parses under 5.1 too)
# preview the build + guard WITHOUT touching live:
pwsh -File .\swap.ps1 -DryRun
```

What it does, in order: (1) **guard** — `git fetch` + `merge-base --is-ancestor
origin/main HEAD`, and **aborts leaving live untouched** if the tree is missing
origin/main; (2) **build + stage** client + backend into `.claudeweb-deploy/`
(gitignored), so a broken build can only abort, never half-write live; (3)
**discover** whatever is serving the port and swap into the standard repo-relative
`.selfdev-build/run-bin`, migrating in-place installs so every machine converges to
the same lock-free layout; (4) **swap** with `robocopy /MIR` but **protecting
`logs/` and `appsettings.json`** (the data store lives in `%APPDATA%\ClaudeWeb` and
is never touched); (5) **restart + health-check** `:5099`.

### NEVER deploy a tree that is missing origin/main

Three times on 2026-06-11/12, parallel self-dev sessions silently clobbered each
other's DEPLOYED features off live (files-tree-view, auth-ip-filter — a live
security gate) by deploying from a branch that predated origin/main. The guard
above is exactly why; do not bypass it by hand-copying binaries or with `-SkipGuard`.
The Git tab's drift warning (plans/git-origin-visibility.md) shows the danger before
you deploy.
