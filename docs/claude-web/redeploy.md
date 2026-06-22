<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# Redeploy this harness to live (:5099)

The production deploy runbook for the harness's OWN repo (self-development).
Read **self-dev.md first** — it covers the isolated-build rule and the
origin/main gate that this procedure depends on.

## What drives a deploy

The tooling lives **off-repo** in `<parent-of-repo>/claudeweb-rollback/` (a
rollback reverts the working tree, so its own scripts must live outside it).
Three scripts run it, and all three are **seeded automatically on first run**
by `DeployScriptProvisioner` from templates in `ClaudeWeb.App/Deploy/templates/`
— with this machine's paths substituted in. So on a fresh checkout they appear
by themselves; you never copy them by hand.

- **swap.ps1** — the gated swap: aborts if origin/main is missing, stops the
  harness, mirrors the staged build into the live bin (`robocopy /MIR`),
  restarts, health-checks `:5099`, appends the `deploys.jsonl` ledger, and
  **auto-rolls-back if the health check fails**.
- **arm.ps1** — arms a dead-man's switch (Windows scheduled task
  `ClaudeWebAutoRollback`) that runs rollback.ps1 in **15 minutes** unless you
  disarm it.
- **rollback.ps1** — restores the `.lastgood` snapshots (bin + client/dist)
  and restarts. Safe to run by hand at any time.

The **Deployments tab** only *reads* this (status + history) and lets you
**"Keep it"** (disarm) or trigger a manual rollback. It does **not** build or
push the forward deploy — that is the procedure below.

## Where the pieces live (read this before you build)

- **Live exe**: `ClaudeWeb.App\bin\Release\net8.0-windows\ClaudeWeb.exe`
  (locked while the harness runs — never build into it).
- **Frontend**: the live app serves `client/dist` **from the bin beside the
  exe** — `EmbeddedApi.ResolveDistPath` checks `<bin>\client\dist` first and
  only falls back to `<repo>\client\dist` when the bin has none. The live exe
  runs from `bin\Release\net8.0-windows`, which has a `client/dist`, so the bin
  copy wins. You must therefore **stage the built frontend into the bin** so
  swap mirrors it in; `npm run build` alone only updates the repo tree, which
  the running app ignores.
- **Backend staging dir**: `.claudeweb-deploy\bin` (gitignored). You build the
  backend Release here AND stage `client/dist` into it; swap.ps1 mirrors the
  whole thing into the live bin with `robocopy /MIR` — which also **purges**
  files not in the source, so a frontend you forget to stage gets deleted off
  live.

## The procedure (run from the repo root)

Steps 1–5 are yours; step 6 hands off to the seeded scripts.

**1. Pass the gate** (also enforced inside swap.ps1 — check it first so you
don't waste a build):

```powershell
git fetch origin
git merge-base --is-ancestor origin/main HEAD   # must exit 0; else merge main first
```

**2. Snapshot the currently-live bin to `.lastgood`** — rollback's restore
point (it captures the live backend *and* its bundled `client/dist`):

```powershell
$bin = 'ClaudeWeb.App\bin\Release\net8.0-windows'
robocopy $bin "$bin.lastgood" /MIR /NFL /NDL /NJH | Out-Null
robocopy client\dist client\dist.lastgood /MIR /NFL /NDL /NJH | Out-Null
```

**3. Build the frontend** (updates `<repo>\client\dist`):

```powershell
npm --prefix client run build
```

**4. Build the backend Release into the STAGING dir** (never the locked live
bin):

```powershell
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -c Release -o .claudeweb-deploy\bin
```

**5. Stage the built frontend INTO the staged bin** so swap carries it into
the live bin (the copy the app actually serves):

```powershell
robocopy client\dist .claudeweb-deploy\bin\client\dist /MIR /NFL /NDL /NJH | Out-Null
```

**6. Arm the dead-man's switch, then run the gated swap** (both from the
seeded dir):

```powershell
$deploy = (Resolve-Path ..\claudeweb-rollback).Path
powershell -ExecutionPolicy Bypass -File "$deploy\arm.ps1"
powershell -ExecutionPolicy Bypass -File "$deploy\swap.ps1"
```

swap.ps1 **stops the harness that is driving you**, so expect your turn's
connection to drop — the swap finishes on its own and restarts `:5099`.

## After the swap

- **Verify**: `curl http://localhost:5099/api/health` returns **200**, then
  load the UI in a real browser (see browser-testing.md).
- **Good** → open the **Deployments tab** and click **"Keep it"** to disarm
  the 15-minute rollback. If you do nothing, rollback.ps1 fires automatically.
- **Bad** → swap's own health check has likely already auto-rolled-back. To
  force it: run `rollback.ps1`, or use the Deployments tab's **Rollback**.

## Logs / ledger (in the seeded dir)

- `swap.log` / `rollback.log` — per-run trace.
- `deploys.jsonl` — append-only history the Deployments tab reads (commit,
  subject, healthOk, event).
