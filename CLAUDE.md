# Claude Web — working notes for Claude

This repo is **Claude Web**, a phone-accessible harness that runs Claude Code
over a repository. It is a C# .NET 8 WinForms app with an embedded Kestrel server
(`ClaudeWeb.App/`) plus a React/Vite frontend (`client/`). When you are editing
this repo *through the app itself*, you are improving the very tool you're running
in ("self-development").

## Build / run the harness normally

```
npm --prefix client run build      # build the frontend (client/dist)
dotnet run --project ClaudeWeb.App # run the harness (GUI + Kestrel on :5099)
```

The "App tab" preview instructions below are managed by the app's
**Prepare for preview** button — re-run it to refresh them.


<!-- claude-web:preview (managed by Claude Web -- re-run "Prepare for preview" to update) -->

## Previewing this app in Claude Web

The Claude Web "App" tab embeds whatever is listening on **port 5200**. When the
user asks you to run, start, or preview the app:

1. Start it listening on **0.0.0.0:5200** (not localhost) so it is reachable
   from the phone over the LAN.
2. Launch it **detached** so it keeps running after your turn ends. Claude Web
   runs you via `claude -p` (one-shot), so a normal child process dies when the
   turn finishes. Windows: `Start-Process`. macOS/Linux: `nohup ... & disown`.
3. Free the port first if something already holds it:
   - Windows: `Get-NetTCPConnection -LocalPort 5200 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
   - macOS/Linux: `lsof -ti tcp:5200 | xargs -r kill`
4. Use this repository's own stack and scripts to start it.

### This repo is Claude Web itself (self-development)

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

<!-- /claude-web:preview -->
