# M0: Project Scaffolding

**Blocked by:** nothing (goes first)
**Blocks:** all other modules

## Goal

A runnable skeleton: .NET 8 WinForms app with embedded Kestrel web
server + React Vite frontend. `dotnet run` starts the backend with
monitoring GUI on screen and Kestrel on port 5099. `npm run dev` in
client/ starts the React dev server on :5173 with proxy to :5099.

## Project Structure

```
claude-web/
  ClaudeWeb.sln
  ClaudeWeb.App/
    ClaudeWeb.App.csproj        (.NET 8, WinForms, Microsoft.AspNetCore.App)
    Program.cs                  (Application.Run + Kestrel startup)
    appsettings.json            (WorkingDirectory, Port, etc.)
    Models/
      AppConfig.cs              (strongly typed config)
    Services/
      Logger.cs                 (same pattern as ClaudeMonitor's Logger)
    UI/
      MainForm.cs               (monitoring GUI -- activity log, status)
    Controllers/
      HealthController.cs       (GET /api/health -> 200)
  client/
    package.json
    vite.config.js              (proxy /api -> :5099)
    src/
      main.jsx
      App.jsx                   (placeholder "Claude Web" text)
    index.html
```

## ClaudeMonitor Patterns to Follow

Look at ClaudeMonitor for the exact patterns. This is the same architecture:

- `ClaudeMonitor.App/Program.cs` -- how to start WinForms + Kestrel together
- `ClaudeMonitor.App/Services/EmbeddedApi.cs` -- embedded Kestrel setup,
  CORS, static file serving, controller registration
- `ClaudeMonitor.App/Services/Logger.cs` -- thread-safe logger that feeds
  both file and GUI display
- `ClaudeMonitor.App/UI/ClaudeMonitorForm.cs` -- WinForms main form pattern

## The Monitoring GUI (MainForm)

The main form should have:

```
+----------------------------------------------------------------+
| Claude Web                                           [_][O][X] |
|----------------------------------------------------------------|
| Working Dir: C:\path\to\working\dir              [Change]      |
| Server: http://0.0.0.0:5099  [Running]                        |
|----------------------------------------------------------------|
|                                                                |
| Activity Log                                                   |
| +---------------------------------------------------------+   |
| | (log entries will appear here as M1/M2/M3 add services) |   |
| +---------------------------------------------------------+   |
|                                                                |
| Requests: 0    Errors: 0                                       |
+----------------------------------------------------------------+
```

For now, just the skeleton:
- TextBox or RichTextBox for activity log (scrolling, read-only)
- Labels for working directory and server status
- "Change" button to pick working directory (FolderBrowserDialog)
- Status bar at bottom with request/error counts

M1, M2, M3 will log to this form through the Logger service.

## Kestrel Setup

- Host on 0.0.0.0:5099 (accessible from phone on same network)
- CORS: allow all origins (needed for React dev server proxy)
- Static files: serve client/dist/ for production builds
- Controllers: just /api/health for now
- Inject Logger and AppConfig into DI container

## Verify

- `dotnet build ClaudeWeb.sln` succeeds
- `dotnet run --project ClaudeWeb.App` shows the WinForms GUI
- `curl http://localhost:5099/api/health` returns 200
- `npm run dev` in client/ shows placeholder at :5173
- React app can call /api/health through the Vite proxy

## Do Not

- Install React UI libraries (M4 picks those)
- Add any real API endpoints beyond /api/health (M1, M2, M3 own those)
- Create page components or routing (M4 owns that)
- Add services beyond Logger and config (M1, M2, M3 own those)
