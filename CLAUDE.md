# Claude Web — working notes for Claude

This repo is **Claude Web**, a phone-accessible harness that runs Claude Code
over a repository. It is a C# .NET 8 WinForms app with an embedded Kestrel server
(`ClaudeWeb.App/`) plus a React/Vite frontend (`client/`). When you are editing
this repo *through the app itself*, you are improving the very tool you're running
in ("self-development").

## Previewing the product in the "App" tab

The app has an **App tab** that simply iframes a fixed **preview port (5200)**.
The harness does **not** start anything — when the user asks you to "run the app"
/ "start it" / "show it in the App tab", **you** start it. Two rules make this
work reliably:

1. **Bind to `0.0.0.0:5200`**, not `localhost`, so the user's phone can reach it
   over the LAN. (The preview port is configurable; default is 5200.)
2. **Launch it detached** so it survives after your turn ends. The app runs you
   via `claude -p` (one-shot), so a normal foreground/background child dies when
   your turn finishes. On Windows use `Start-Process` (PowerShell) so the server
   is an independent process.

Before starting, free the port: `Get-NetTCPConnection -LocalPort 5200 -ErrorAction
SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`.

### Self-development: running THIS app as the product

You cannot build into the running harness's own `bin/` (its `ClaudeWeb.exe` is
locked) or reuse port 5099. Build to an **isolated dir** and run on **5200**:

```powershell
# 1. Frontend (outputs client/dist)
npm --prefix client install
npm --prefix client run build

# 2. Backend -> isolated output dir (never the locked bin/)
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin

# 3. The preview exe finds the UI at <basedir>/client/dist -- copy it there
Copy-Item client/dist .claudeweb-preview/bin/client/dist -Recurse -Force

# 4. Launch detached on port 5200 (CLAUDEWEB_PORT overrides appsettings)
$env:CLAUDEWEB_PORT = "5200"
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window will appear (the
app is a desktop+web hybrid) — that's expected. To restart after changes, free
port 5200 (above), rebuild steps 1–3, and relaunch.

### A generic product (other repos)

If the opened repo is a normal web app, start its dev server detached on
`0.0.0.0:5200`, e.g. `Start-Process npm -ArgumentList
'run','dev','--','--host','0.0.0.0','--port','5200'`. Match the repo's actual
stack and scripts.

## Build / run the harness normally

```
npm --prefix client run build      # build the frontend (client/dist)
dotnet run --project ClaudeWeb.App # run the harness (GUI + Kestrel on :5099)
```
