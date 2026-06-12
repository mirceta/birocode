<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on 5200:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
Copy-Item client/dist .claudeweb-preview/bin/client/dist -Recurse -Force
$env:CLAUDEWEB_PORT = "5200"
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.

## Deploy rule — NEVER deploy a tree that is missing origin/main

Three times on 2026-06-11/12, parallel self-dev sessions silently clobbered
each other's DEPLOYED features off live (files-tree-view, auth-ip-filter — a
live security gate) by deploying from a branch that predated origin/main.

Before ANY production deploy of this repo:

1. `git fetch origin`
2. `git merge-base --is-ancestor origin/main HEAD` must succeed — if not,
   merge main into your branch first and re-verify.
3. Stage the backend AND build the frontend from that same tree, then swap.

This is also ENFORCED at the chokepoint: the deploy `swap.ps1` aborts (and
leaves the live harness untouched) when the working tree does not contain
origin/main. Do not bypass it by hand-copying binaries. The Git tab's drift
warning (plans/git-origin-visibility.md) shows the danger before you deploy.
