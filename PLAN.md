# Plan: Claude Web -- Phone-Accessible Document Workspace

## Tech Stack

- **Backend:** C# .NET 8, WinForms + embedded Kestrel (same pattern as ClaudeMonitor)
- **Frontend:** React + Vite, mobile-first
- **CLI:** `claude -p --output-format stream-json` (free via Max subscription)
- **Persistence:** Git for save/history (no database)
- **Build:** `dotnet build` for backend, `npm run dev` for frontend

The backend is a WinForms desktop app with a monitoring GUI -- you can
see every request, every CLI process, every error in real time, just
like ClaudeMonitor. It embeds a Kestrel web server that serves the
React app and exposes API endpoints.

---

## What This Is

A React web app that connects to Claude Code running on a remote computer.
A non-technical user opens it in her phone browser and gets a clean,
conversational experience with full visibility into her document repository.
No installation, no GitHub account, no technical setup.

See [ANALYSIS.md](ANALYSIS.md) for the full architecture decision and
comparison of alternatives.

---

## The User Experience

Full screen mockups, navigation map, save flow, session management,
and UX principles: **[plans/UX-experience.md](plans/UX-experience.md)**

Quick preview -- she opens a URL on her phone and sees a chat:

```
+----------------------------------+
|  Claude Web               [Save] |
|----------------------------------|
|                                  |
|  Hi! How can I help you today?   |
|                                  |
|          Can you update the      |
|          financial projections   |
|          section? The revenue    |
|          should be 500k not 300k |
|                                  |
|  Sure! I'll update the revenue   |
|  figures in your financial       |
|  projections...                  |
|                                  |
|  [Editing financial-plan.md...]  |
|                                  |
|----------------------------------|
| Type a message...         [Send] |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

Three tabs at the bottom: Chat, Files (read-only browser), History
(save timeline with "Go back"). Save button always visible.

---

## Architecture

### Two sides of the same app

```
   HOST COMPUTER (your machine)
   +----------------------------------------------------------+
   |                                                          |
   |  ClaudeWeb.App (WinForms + Kestrel)                      |
   |                                                          |
   |  +-------------------------+  +------------------------+ |
   |  | Monitoring GUI          |  | Embedded Web Server    | |
   |  | (WinForms, you see this)|  | (Kestrel, port 5099)   | |
   |  |                         |  |                        | |
   |  | - Active CLI sessions   |  | /api/chat     (SSE)   | |
   |  | - Request log           |  | /api/sessions         | |
   |  | - File access log       |  | /api/files            | |
   |  | - Git operations log    |  | /api/save             | |
   |  | - Errors + warnings     |  | /api/history          | |
   |  | - Config (working dir)  |  | /* (React static)     | |
   |  +-------------------------+  +------------------------+ |
   |              |                         |                  |
   |              v                         v                  |
   |  +---------------------------------------------------+   |
   |  | Services                                          |   |
   |  | - CliRunnerService (spawns claude -p)              |   |
   |  | - FileService (browse working dir)                |   |
   |  | - GitService (save/restore)                       |   |
   |  | - SessionService (list/parse JSONL)               |   |
   |  +---------------------------------------------------+   |
   |              |                                            |
   |              v                                            |
   |        Claude Code CLI (free via Max sub)                 |
   +----------------------------------------------------------+

   PHONE (her browser)
   +-------------------+
   |                   |
   |  React App        | -- HTTP/SSE --> Kestrel on port 5099
   |  - Chat           |
   |  - Files          |
   |  - History        |
   |                   |
   +-------------------+
```

The operator (you) sees the WinForms GUI on the host machine.
The user (she) sees the React app on her phone.
Both are powered by the same backend services.

### The monitoring GUI (what the operator sees)

```
+----------------------------------------------------------------+
| Claude Web Monitor                                    [_][O][X] |
|----------------------------------------------------------------|
| Working Dir: C:\Users\km\projects\business-plan   [Change]     |
| Server: http://0.0.0.0:5099  [Running]                        |
|----------------------------------------------------------------|
|                                                                |
| Activity Log                                                   |
| +---------------------------------------------------------+   |
| | 14:32:01 [CHAT] New session started (abc123...)         |   |
| | 14:32:01 [CLI]  Spawning claude -p "update revenue..."  |   |
| | 14:32:03 [CLI]  Tool use: Edit financial-plan.md         |   |
| | 14:32:05 [CLI]  Response complete (1,247 tokens)         |   |
| | 14:33:12 [FILE] GET /api/files?path=/financials          |   |
| | 14:33:14 [FILE] GET /api/files/read?path=/financial...   |   |
| | 14:35:00 [GIT]  Save: "Updated revenue to 500k" (a3f..) |   |
| | 14:35:00 [CHAT] Session resumed (abc123...)              |   |
| +---------------------------------------------------------+   |
|                                                                |
| Active Sessions: 1    Total Requests: 8    Errors: 0           |
+----------------------------------------------------------------+
```

### How a chat message flows

```
1. She types "update the revenue to 500k" on her phone

2. Phone sends HTTP POST /api/chat  ----->  Kestrel endpoint

3. CliRunnerService spawns:
   claude -p "update the revenue..." --output-format stream-json
          --include-partial-messages --verbose
   (the --include-partial-messages flag is what enables token streaming;
    verified against the real CLI -- see plans/M1-cli-runner.md)

4. Claude CLI starts working:
   - Reads the file
   - Edits the file
   - Writes a response

5. Kestrel translates raw CLI events into a stable SSE contract  <-- stdout
   {type:token}, {type:tool}, {type:done}  (GUI logs each in real time)

6. Phone renders tokens as they arrive:
   "Sure"  "Sure! I'll"  "Sure! I'll update"  "Sure! I'll update the..."

7. She sees the response build up in real time, like ChatGPT
```

### How Save and History work (git, hidden from user)

```
She taps [Save]                    GitService runs
                        ------>    git add -A
"What changed?"                    git commit -m "Updated revenue to 500k"
"Updated revenue"       ------>    (done -- she sees "Saved!")
                                   (GUI logs: [GIT] Save: "Updated revenue...")

She taps [History]                 GitService runs
                        ------>    git log --format=...
                        <------    [{ hash, date, message }, ...]
                                   (rendered as a timeline)

She taps [Go back]                 GitService runs
on "First draft"        ------>    git checkout <hash> -- .
                        <------    (files restored to that point)
                                   (GUI logs: [GIT] Restored to a3f...)
```

---

## Execution Order

```
Phase 1 (sequential)     Phase 2 (parallel)         Phase 3 (parallel)
+-------------------+    +------------------------+  +---------------------+
| M0: Scaffolding   | -> | M1: CLI Runner (large) |  | M5: Chat UI (large) |
|                   |    | M2: File API (small)   |  | M6: File Browser    |
|                   |    | M3: Git API (small)    |  | M7: Save/History    |
|                   |    | M4: App Shell (medium) |  |                     |
+-------------------+    +------------------------+  +---------------------+

Phase 2 modules are INDEPENDENT -- they touch different files.
Phase 3 modules DEPEND on Phase 2 (see dependency map below).
```

### Rules for agents

1. **Phase 1 runs alone.** Do not start anything else until M0 is done,
   `dotnet build` succeeds, and the React dev server starts.
2. **Phase 2 modules are fully independent.** M1, M2, M3, M4 touch
   different files and different endpoints. They can run in parallel
   without conflicts.
3. **Phase 3 modules depend on Phase 2.** M5 needs M1 + M4. M6 needs
   M2 + M4. M7 needs M3 + M4. Do not start a frontend module until
   its backend dependency is merged.
4. **No module may modify another module's files.** If you need
   something from another module, define the interface and wait.
5. **Every module must be testable in isolation** using curl (backend)
   or the browser (frontend) before it is considered done.

### Dependency map

| Module | Blocked by | Blocks   | Plan                                  |
|--------|------------|----------|---------------------------------------|
| M0     | nothing    | all      | [plans/M0-scaffolding.md](plans/M0-scaffolding.md)   |
| M1     | M0         | M5       | [plans/M1-cli-runner.md](plans/M1-cli-runner.md)     |
| M2     | M0         | M6       | [plans/M2-file-api.md](plans/M2-file-api.md)         |
| M3     | M0         | M7       | [plans/M3-git-api.md](plans/M3-git-api.md)           |
| M4     | M0         | M5 M6 M7| [plans/M4-app-shell.md](plans/M4-app-shell.md)       |
| M5     | M1 M4      | nothing  | [plans/M5-chat-ui.md](plans/M5-chat-ui.md)           |
| M6     | M2 M4      | nothing  | [plans/M6-file-browser.md](plans/M6-file-browser.md) |
| M7     | M3 M4      | nothing  | [plans/M7-save-history.md](plans/M7-save-history.md) |

UX spec: [plans/UX-experience.md](plans/UX-experience.md)

### What each module builds (quick reference)

```
BACKEND (ClaudeWeb.App, C#)            FRONTEND (client/, React)

M1: CliRunnerService                   M4: App Shell
  + ChatController                       Bottom nav (Chat/Files/History)
  POST /api/chat (SSE stream)            Routing, layout, Save button
  GET  /api/sessions                     Loading/error components

M2: FileService                        M5: Chat UI
  + FileController                       Message bubbles, streaming
  GET  /api/files?path=                  Markdown rendering
  GET  /api/files/read?path=             Thinking indicator, tool status
                                         Session picker
M3: GitService
  + GitController                      M6: File Browser
  POST /api/save                         Folder/file list, breadcrumbs
  GET  /api/history                      Read-only file viewer
  POST /api/history/restore
                                       M7: Save/History
M0: Scaffolding                          Save handler + note modal
  WinForms main form (monitoring GUI)    History timeline, restore
  Embedded Kestrel web server
  Logger, config, solution structure
```

---

## Status: BUILT

All modules (M0-M7) are implemented and verified end to end:
- Backend builds clean (`dotnet build claude-web/ClaudeWeb.sln`, 0 errors).
- Frontend builds clean (`cd claude-web/client && npm run build`).
- Verified against the real CLI: chat streams `session -> token -> done`;
  /api/files, /api/save, /api/history work; auth returns 401 without the
  password and 200 with it; path traversal is blocked (403); the server
  serves the React app with correct asset MIME types and SPA deep links.

Resolved design decisions:
- Working directory: FIXED in `appsettings.json` (`WorkingDirectory`).
- Auth: simple shared password (`AuthPassword`), sent by the client as
  the `X-Auth-Password` header. `GET /api/health` and static assets are exempt.

## Running It

1. Build the frontend: `cd claude-web/client && npm install && npm run build`
   (produces `client/dist`, which the backend serves).
2. Run the backend: `dotnet run --project claude-web/ClaudeWeb.App`
   (or launch the built `ClaudeWeb.exe`). The monitoring GUI opens and
   Kestrel listens on `http://0.0.0.0:5099`.
3. On the host, open `http://localhost:5099`. From a phone on the same
   network, open `http://<host-lan-ip>:5099`. Enter the access code
   (the `AuthPassword`, default `changeme`).
4. Configuration lives in `claude-web/ClaudeWeb.App/appsettings.json`:
   `WorkingDirectory` (the folder Claude edits), `Port`, `AuthPassword`.
   The working directory can also be changed at runtime from the GUI.

Note: port 5099 must be free. If another process holds it, change `Port`
in `appsettings.json`.

## Still Open (deployment, not code)

- Tunnel solution for remote phone access: ngrok, Cloudflare Tunnel, or Tailscale?
- Whether to change the default `AuthPassword` before exposing publicly.

## Refactor: folder structure (in progress)

ClaudeWeb.App/Services/ is flat (10 files in one folder). Reorganize by
concern, with namespaces matching folders, keeping the build green:

  Services/Hosting/   EmbeddedApi.cs, PasswordAuthMiddleware.cs  -> ClaudeWeb.Services.Hosting
  Services/Logging/   Logger.cs                                  -> ClaudeWeb.Services.Logging
  Services/Chat/      CliRunnerService.cs, SessionService.cs,
                      ChatModuleExtensions.cs                    -> ClaudeWeb.Services.Chat
  Services/Files/     FileService.cs, FileModuleExtensions.cs    -> ClaudeWeb.Services.Files
  Services/Git/       GitService.cs, GitModuleExtensions.cs      -> ClaudeWeb.Services.Git

Controllers/ stays flat (only 4). Update usings across the app. Light
clean-code pass for any duplication / SOLID issues. Verify `dotnet build`
and a runtime smoke test. Code itself is already clean -- this is ordering.

## Installer (built)

A WinForms installer at claude-web/installer/ (own .sln, ClaudeWebInstaller),
following the installer skill's 3-layer pattern: Models/InstallStep.cs,
Services/InstallerService.cs (no UI, reports via events), InstallerForm.cs
(no logic, subscribes to events). Source of truth is claude-web/README.md.
Scope: local setup + diagnostics only (no tunnel / remote access).

Diagnostic CHECK steps (the "is it set up correctly" part):
- .NET 8 Desktop Runtime present (plus SDK note for building)
- `claude` CLI present AND authenticated -- probes with one tiny real request
- git present
- Node + npm present (build-time only)
- WorkingDirectory exists and is a git repo (auto-fix: create + git init)
- Frontend built (client/dist present)
- Configured port free (reports owning PID if not)
- AuthPassword set (warns if still the default 'changeme')

INSTALL/BUILD steps: apply settings to appsettings.json, npm install, build
frontend + backend. TEST: launch the app and verify GET /api/health returns
200, then stop it. Replaces the skill's ClaudeMonitor prerequisite with the
claude-CLI checks, since Claude Web talks to the CLI directly.

## Setup and Deploy program: Internet Deployment tab (BUILT)

The installer at claude-web/installer/ (ClaudeWebInstaller) is now a two-tab
"Claude Web Setup & Deploy" app. Tab 1 "Local Setup" is the existing installer,
unchanged. Tab 2 "Internet Deployment" is new and stays disabled until the Local
Setup Check All passes (InstallerService.AllChecksPassed). Files added:
Models/DeployStep.cs (DeployPhase enum, reuses StepStatus), Services/DeployerService.cs
(no UI, reports via StepStatusChanged / LogMessage). InstallerForm.cs hosts both
tabs. settings.json gained a "Deploy" section (Domain, ProxyPort, PfxPath,
PfxPassword, CertThumbprint, SiteName); both services merge-write so neither
clobbers the other's keys. cmd.exe /c for netsh, powershell.exe -Command for IIS
cmdlets. IIS/cert/ARR steps require Administrator (detected via WindowsPrincipal).
ClaudeWeb.App and client/ source were not modified.

Decisions:
- ONE WinForms app. The existing claude-web/installer/ program gains a second
  tab. Tab 1 "Local Setup" = the existing installer (unchanged behavior).
  Tab 2 "Internet Deployment" = a new DeployerService following the deployer
  skill's 3-layer pattern (Models/DeployStep.cs, Services/DeployerService.cs,
  a deploy panel in the form). Window title becomes "Claude Web Setup & Deploy".
  The Deploy tab is disabled until the Local Setup checks pass.
- The backend runs as the existing WinForms app in the operator's logged-in
  session (NO headless service). IIS reverse-proxies to its port. So deploy =
  IIS ARR in front + autostart the GUI app. No change to ClaudeWeb.App source.

Deploy steps. The checks focus on OUR system and connectivity, not on the IIS
box's prerequisites -- that box is trusted (it already proxies the api-chatbot
through IIS + ARR), so "is IIS/ARR installed" is not re-verified. The one
mandatory ARR-enable is folded into the site-create action.
- PreFlight: Local Setup passed (backend + frontend built).
- Backend (our system): responds on localhost:<port>/api/health; reachable on
  the machine's LAN IP (confirms 0.0.0.0 binding, not localhost-only); proxy
  target port == appsettings Port; Security notes (access code / CORS /
  rate-limit) as an informational warning that never blocks.
- Firewall: an enabled inbound TCP allow rule exists for the backend port and
  for 443 (matches ours or a pre-existing one so no duplicates). Deploy action
  adds the rule via New-NetFirewallRule (admin).
- Configure (settings panel): public domain, proxy target port, TLS cert
  (.pfx + password, or an existing thumbprint), IIS site name.
- IisProxy (admin): create IIS site on 443 bound to the domain + SSL cert
  (folds in enabling ARR proxy at server level); write web.config (reverse
  proxy -> http://localhost:<port>, HTTP->HTTPS redirect, SSE
  responseBufferLimit=0, websockets on).
- Autostart: register ClaudeWeb.App to start at logon (Startup-folder shortcut).
- Verify: GET https://<domain>/api/health returns 200 (plus localhost health).

Needs Administrator for the firewall/IIS/cert steps -- the program detects
elevation and instructs the user to relaunch as Administrator if needed.
Hardening code changes (restrict CORS, rate-limit the password gate) are
surfaced as warnings and applied separately if wanted before going fully public.
