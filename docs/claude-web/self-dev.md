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

## Isolate the data store too (`CLAUDEWEB_DATADIR`)

A preview shares the live operator's state by default: `repositories.json`,
`auth.json`, etc. live in `%APPDATA%\ClaudeWeb`, and `Environment.GetFolderPath`
ignores the `APPDATA` env var on Windows (it uses the known-folder API), so you
cannot redirect it that way. To run a preview against a throwaway store — fresh
seeded password (`changeme`), no operator repos/ports bleeding in, and zero risk
of touching the live files — set `CLAUDEWEB_DATADIR`:

```powershell
$env:CLAUDEWEB_DATADIR = "$PWD/.claudeweb-preview/appdata-iso"
```

All stores resolve through `AppPaths.DataDir`, so this redirects every one of
them at once. Leave it unset for a normal run.

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
